"""Budget cap, spend ledger, and reuse cache — no live API, no real DB.

A tiny fake async connection emulates just the cursor/commit surface the
ledger and cache use, backed by in-memory dicts. Provider HTTP is faked with
httpx.MockTransport. Nothing here makes a paid call or needs credentials.
"""
from __future__ import annotations

import asyncio

import httpx
import pytest

from app.config import Settings
from app.ingestion.embedding import create_embedding_service
from app.providers.budget import BudgetLedger
from app.providers.cache import AICache, embedding_key, generation_key
from app.providers.generation import get_guarded_generation_client
from app.providers.pricing import estimate_cost_inr, worst_case_cost_inr
from app.providers.shared.errors import BudgetExhaustedError


# --------------------------------------------------------------------------
# Fake DB: enough of psycopg's async cursor/commit for ledger + cache.
# --------------------------------------------------------------------------
class FakeCursor:
    def __init__(self, store):
        self._store = store
        self._result = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, sql, params=()):
        # The real code opens these cursors with row_factory=dict_row and reads
        # results by aliased name, so the fake returns dict rows to match.
        s = " ".join(sql.split())
        if s.startswith("SELECT pg_advisory_xact_lock"):
            pass  # single connection: nothing to serialize against
        elif s.startswith("SELECT COALESCE(SUM(est_cost_inr)"):
            self._result = {"total": sum(r["est_cost_inr"] for r in self._store["usage"].values())}
        elif s.startswith("INSERT INTO provider_usage"):
            rid, provider, model, task, cost = params
            self._store["usage"][rid] = {"est_cost_inr": cost, "provider": provider,
                                          "model": model, "task": task, "reserved": True}
        elif s.startswith("UPDATE provider_usage"):
            cost, itok, otok, est, ok, retries, rid = params
            self._store["usage"][rid].update(est_cost_inr=cost, input_tokens=itok,
                                              output_tokens=otok, reserved=False)
        elif s.startswith("DELETE FROM provider_usage"):
            self._store["usage"].pop(params[0], None)
        elif s.startswith("SELECT value_json FROM ai_cache"):
            kind, kh = params
            v = self._store["cache"].get((kind, kh))
            self._result = {"value_json": v} if v is not None else None
        elif s.startswith("UPDATE ai_cache"):
            pass
        elif s.startswith("INSERT INTO ai_cache"):
            kind, kh, model, value = params
            self._store["cache"].setdefault((kind, kh), value.obj if hasattr(value, "obj") else value)
        else:
            raise AssertionError("unexpected SQL: " + s)

    async def fetchone(self):
        return self._result


class FakeConn:
    def __init__(self):
        self.store = {"usage": {}, "cache": {}}

    def cursor(self, *a, **k):
        return FakeCursor(self.store)

    async def commit(self):
        pass

    async def rollback(self):
        pass


def settings():
    return Settings(_env_file=None, gemini_api_key="x", typesafe_api_key="y",
                    generation_provider="gemini", jev_backend="typesafe",
                    ai_budget_inr=2000.0, usd_inr_rate=96.0)


def gen_transport(counter):
    def handler(req):
        counter["n"] += 1
        return httpx.Response(200, json={"status": "completed", "steps": [
            {"type": "model_output", "content": [{"type": "text", "text": '{"answer": "ok"}'}]}]})
    return httpx.MockTransport(handler)


def emb_transport(counter):
    def handler(req):
        import json
        n = len(json.loads(req.content)["requests"])
        counter["n"] += 1
        return httpx.Response(200, json={"embeddings": [{"values": [0.1] * 1536} for _ in range(n)]})
    return httpx.MockTransport(handler)


SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]}


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------
def test_reserve_refuses_over_cap():
    async def run():
        s = settings(); s.ai_budget_inr = 0.001  # basically zero budget
        led = BudgetLedger(FakeConn(), settings=s)
        with pytest.raises(BudgetExhaustedError):
            await led.reserve("gemini", "gemini-3.8-flash", "generation", 5.0)
    asyncio.run(run())


def test_ledger_records_actual_cost():
    async def run():
        s = settings()
        conn = FakeConn()
        led = BudgetLedger(conn, settings=s)
        r = await led.reserve("gemini", "gemini-3.8-flash", "generation",
                              worst_case_cost_inr("gemini-3.8-flash", 1000, 16000, 96.0))
        # After reserve, spend equals the worst-case hold.
        assert await led.spent_inr() > 0
        await led.record(r, input_tokens=100, output_tokens=50,
                         cost_inr=estimate_cost_inr("gemini-3.8-flash", 100, 50, 96.0))
        # After record, spend drops to the (much smaller) real cost.
        assert abs(await led.spent_inr() - estimate_cost_inr("gemini-3.8-flash", 100, 50, 96.0)) < 1e-9
    asyncio.run(run())


def test_generation_cache_hit_skips_second_call():
    async def run():
        s = settings()
        conn = FakeConn()
        counter = {"n": 0}
        client = get_guarded_generation_client(s, conn=conn, transport=gen_transport(counter))
        r1 = await client.generate_structured(system="sys", prompt="p", schema=SCHEMA, content_version="c1")
        r2 = await client.generate_structured(system="sys", prompt="p", schema=SCHEMA, content_version="c1")
        assert counter["n"] == 1                 # second call served from cache
        assert r1.data == r2.data == {"answer": "ok"}
        assert r2.stop_reason == "cache"
    asyncio.run(run())


def test_generation_cache_key_includes_prompt():
    """Regression (audit 0.2): same schema, different prompts must NOT share
    a cache entry; the same prompt with a different variant must not either."""
    async def run():
        s = settings()
        conn = FakeConn()
        counter = {"n": 0}
        client = get_guarded_generation_client(s, conn=conn, transport=gen_transport(counter))
        await client.generate_structured(system="sys", prompt="note A", schema=SCHEMA)
        await client.generate_structured(system="sys", prompt="note B", schema=SCHEMA)
        assert counter["n"] == 2                 # different prompts -> 2 real calls
        await client.generate_structured(system="sys", prompt="note A", schema=SCHEMA)
        assert counter["n"] == 2                 # identical request -> cache hit
        await client.generate_structured(system="sys", prompt="note A", schema=SCHEMA,
                                         variant="run-1")
        assert counter["n"] == 3                 # independent sample -> real call
    asyncio.run(run())


def test_generation_budget_blocks_before_call():
    async def run():
        s = settings(); s.ai_budget_inr = 0.0001  # cannot afford one call
        conn = FakeConn()
        counter = {"n": 0}
        client = get_guarded_generation_client(s, conn=conn, transport=gen_transport(counter))
        with pytest.raises(BudgetExhaustedError):
            await client.generate_structured(system="sys", prompt="p", schema=SCHEMA)
        assert counter["n"] == 0                 # provider was never called
    asyncio.run(run())


def test_embedding_cache_avoids_recompute():
    async def run():
        s = settings()
        conn = FakeConn()
        counter = {"n": 0}
        svc = create_embedding_service(s, conn=conn)
        # Reach into the guarded client's transport by rebuilding with a mock:
        from app.providers.embeddings import get_embedding_client
        from app.providers.guard import GuardedEmbeddingClient
        raw = get_embedding_client(s, transport=emb_transport(counter))
        guarded = GuardedEmbeddingClient(raw, ledger=BudgetLedger(conn, settings=s),
                                         cache=AICache(conn, settings=s), settings=s)
        v1 = await guarded.embed(["water boils at 100C", "sky is blue"])
        v2 = await guarded.embed(["water boils at 100C", "sky is blue"])
        assert len(v1) == 2 and len(v1[0]) == 1536
        assert counter["n"] == 1                 # second batch fully cached
    asyncio.run(run())


def test_ledger_stores_no_text():
    async def run():
        s = settings()
        conn = FakeConn()
        counter = {"n": 0}
        client = get_guarded_generation_client(s, conn=conn, transport=gen_transport(counter))
        await client.generate_structured(system="secret note body", prompt="learner answer text", schema=SCHEMA)
        # The usage ledger rows must contain no free-text fields.
        for row in conn.store["usage"].values():
            for v in row.values():
                assert "secret note" not in str(v) and "learner answer" not in str(v)
    asyncio.run(run())


if __name__ == "__main__":
    for fn in [test_reserve_refuses_over_cap, test_ledger_records_actual_cost,
               test_generation_cache_hit_skips_second_call, test_generation_budget_blocks_before_call,
               test_embedding_cache_avoids_recompute, test_ledger_stores_no_text]:
        fn(); print("ok", fn.__name__)
