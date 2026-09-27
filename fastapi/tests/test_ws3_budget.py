"""WS3 budget fixes: max-token cap, usage parsing, atomic reserve, settlement.

No live API and no real DB. Provider HTTP is faked with httpx.MockTransport
using the documented response field names:
- Gemini Interactions ``usage.total_input_tokens / total_output_tokens /
  total_thought_tokens / total_tokens`` (ai.google.dev/api/interactions-api)
- Gemini batchEmbedContents ``usageMetadata.promptTokenCount``
  (ai.google.dev/api/embeddings)
- Jev ``usage.input_tokens / output_tokens`` (+ OpenRouter ``usage.cost``)
"""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.config import Settings
from app.providers.budget import RESERVE_LOCK_KEY, BudgetLedger
from app.providers.cache import AICache
from app.providers.classification.jev import GuardedJevClient, JevClient, Noul
from app.providers.embeddings.gemini import GeminiEmbeddingClient
from app.providers.generation import get_guarded_generation_client
from app.providers.generation.gemini import parse_gemini_usage
from app.providers.guard import GuardedEmbeddingClient
from app.providers.pricing import estimate_cost_inr, worst_case_cost_inr
from app.providers.shared.errors import (
    BudgetExhaustedError,
    ProviderRequestError,
    ProviderResponseError,
    ProviderTimeoutError,
)

MODEL = "gemini-3.8-flash"
SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]}


# --------------------------------------------------------------------------
# Fake DB (single connection) that keeps full ledger rows.
# --------------------------------------------------------------------------
class LedgerCursor:
    def __init__(self, conn):
        self._c = conn
        self._result = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, sql, params=()):
        s = " ".join(sql.split())
        self._c.log.append(" ".join(s.replace("(", " ").split()[:3]))
        rows = self._c.rows
        if s.startswith("SELECT pg_advisory_xact_lock"):
            assert params == (RESERVE_LOCK_KEY,)
        elif s.startswith("SELECT COALESCE(SUM(est_cost_inr)"):
            self._result = {"total": sum(r["cost"] for r in rows.values())}
        elif s.startswith("INSERT INTO provider_usage"):
            if self._c.fail_insert:
                raise RuntimeError("db down")
            rid, provider, model, task, cost = params
            rows[rid] = {"cost": cost, "reserved": True, "success": False, "task": task}
        elif s.startswith("UPDATE provider_usage"):
            cost, itok, otok, est, ok, retries, rid = params
            rows[rid].update(cost=cost, input_tokens=itok, output_tokens=otok,
                             estimated=est, success=ok, reserved=False)
        elif s.startswith("DELETE FROM provider_usage"):
            rows.pop(params[0], None)
        elif s.startswith("SELECT value_json FROM ai_cache"):
            self._result = None  # always a miss
        elif s.startswith("INSERT INTO ai_cache"):
            pass
        else:
            raise AssertionError("unexpected SQL: " + s)

    async def fetchone(self):
        return self._result


class LedgerConn:
    def __init__(self):
        self.rows: dict = {}
        self.log: list[str] = []
        self.commits = 0
        self.rollbacks = 0
        self.fail_insert = False

    def cursor(self, *a, **k):
        return LedgerCursor(self)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


def settings(**kw):
    base = dict(_env_file=None, gemini_api_key="x", typesafe_api_key="y",
                generation_provider="gemini", jev_backend="typesafe",
                ai_budget_inr=2000.0, usd_inr_rate=96.0, generation_max_tokens=16000)
    base.update(kw)
    return Settings(**base)


def gemini_body(text='{"answer": "ok"}', status="completed", usage="default"):
    body = {"status": status, "model": MODEL,
            "steps": [{"type": "model_output", "content": [{"type": "text", "text": text}]}]}
    if usage == "default":
        body["usage"] = {"total_input_tokens": 120, "total_output_tokens": 30,
                         "total_thought_tokens": 50, "total_cached_tokens": 0,
                         "total_tool_use_tokens": 0, "total_tokens": 200}
    elif usage is not None:
        body["usage"] = usage
    return body


def transport_returning(body, seen=None, status_code=200):
    def handler(req):
        if seen is not None:
            seen.append(json.loads(req.content))
        return httpx.Response(status_code, json=body)
    return httpx.MockTransport(handler)


def only_row(conn):
    assert len(conn.rows) == 1
    return next(iter(conn.rows.values()))


# --------------------------------------------------------------------------
# Task 1 + 2: max tokens actually sent; usage parsed from the real fields
# --------------------------------------------------------------------------
def test_gemini_sends_max_output_tokens_and_bills_thoughts():
    async def run():
        s = settings(gemini_thinking_level="low")
        conn, seen = LedgerConn(), []
        client = get_guarded_generation_client(s, conn=conn, transport=transport_returning(gemini_body(), seen))
        r = await client.generate_structured(system="sys", prompt="p", schema=SCHEMA, max_tokens=900)
        payload = seen[0]
        assert payload["generation_config"] == {"max_output_tokens": 900, "thinking_level": "low"}
        assert payload["system_instruction"] == "sys" and payload["input"] == "p"
        assert payload["store"] is False
        # billed output = output (30) + thought (50)
        assert r.usage.input_tokens == 120 and r.usage.output_tokens == 80 and r.usage.thought_tokens == 50
        row = only_row(conn)
        assert row["reserved"] is False and row["success"] is True and row["estimated"] is False
        assert row["cost"] == pytest.approx(estimate_cost_inr(MODEL, 120, 80, 96.0))
    asyncio.run(run())


def test_gemini_default_cap_comes_from_settings():
    async def run():
        s = settings(generation_max_tokens=4096)
        seen = []
        client = get_guarded_generation_client(s, conn=LedgerConn(), transport=transport_returning(gemini_body(), seen))
        await client.generate_structured(system="", prompt="p", schema=SCHEMA)
        assert seen[0]["generation_config"] == {"max_output_tokens": 4096}
        assert "system_instruction" not in seen[0]
    asyncio.run(run())


def test_parse_gemini_usage_variants():
    u = parse_gemini_usage({"usage": {"total_input_tokens": "7", "total_output_tokens": 0,
                                      "total_thought_tokens": 22, "total_tokens": 29}})
    assert (u.input_tokens, u.output_tokens, u.thought_tokens) == (7, 22, 22)  # "7" str + 0 kept
    u = parse_gemini_usage({"usage": {"total_input_tokens": 10, "total_tokens": 60}})
    assert (u.input_tokens, u.output_tokens) == (10, 50)                      # derived from total
    u = parse_gemini_usage({"usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 3,
                                              "thoughtsTokenCount": 4, "totalTokenCount": 12}})
    assert (u.input_tokens, u.output_tokens) == (5, 7)                        # generateContent shape
    u = parse_gemini_usage({"usage_metadata": {"prompt_token_count": 5, "candidates_token_count": 3}})
    assert (u.input_tokens, u.output_tokens) == (5, 3)                        # SDK snake_case shape
    assert not parse_gemini_usage({}).reported


def test_missing_usage_is_estimated_not_worst_case():
    async def run():
        s = settings()
        conn = LedgerConn()
        client = get_guarded_generation_client(s, conn=conn, transport=transport_returning(gemini_body(usage=None)))
        await client.generate_structured(system="s" * 400, prompt="p" * 400, schema=SCHEMA)
        row = only_row(conn)
        worst = worst_case_cost_inr(MODEL, 200, 16000, 96.0)
        assert row["estimated"] is True
        assert row["input_tokens"] == 200                 # 800 chars / 4
        assert row["output_tokens"] == len('{"answer": "ok"}') // 4
        assert row["cost"] < worst / 100                  # nowhere near the ~₹5.9 worst case
    asyncio.run(run())


# --------------------------------------------------------------------------
# Task 4: settlement on failures and cancellation
# --------------------------------------------------------------------------
def test_parse_failure_keeps_billed_cost():
    async def run():
        conn = LedgerConn()
        client = get_guarded_generation_client(settings(), conn=conn,
                                               transport=transport_returning(gemini_body(text="not json")))
        with pytest.raises(ProviderResponseError):
            await client.generate_structured(system="sys", prompt="p", schema=SCHEMA)
        row = only_row(conn)                              # NOT deleted
        assert row["reserved"] is False and row["success"] is False
        assert row["cost"] == pytest.approx(estimate_cost_inr(MODEL, 120, 80, 96.0))
    asyncio.run(run())


def test_incomplete_status_raises_and_records_usage():
    async def run():
        conn = LedgerConn()
        body = gemini_body(text='{"answer": "tru', status="incomplete",
                           usage={"total_input_tokens": 100, "total_output_tokens": 700,
                                  "total_thought_tokens": 200, "total_tokens": 1000})
        client = get_guarded_generation_client(settings(), conn=conn, transport=transport_returning(body))
        with pytest.raises(ProviderResponseError, match="incomplete"):
            await client.generate_structured(system="sys", prompt="p", schema=SCHEMA, max_tokens=900)
        row = only_row(conn)
        assert row["output_tokens"] == 900 and row["success"] is False
    asyncio.run(run())


def test_rejected_request_releases_hold():
    async def run():
        conn = LedgerConn()
        client = get_guarded_generation_client(
            settings(), conn=conn, max_retries=0,
            transport=transport_returning({"error": {"message": "bad"}}, status_code=400))
        with pytest.raises(ProviderRequestError):
            await client.generate_structured(system="sys", prompt="p", schema=SCHEMA)
        assert conn.rows == {}                            # 4xx is not billed
    asyncio.run(run())


def test_timeout_keeps_worst_case():
    async def run():
        conn = LedgerConn()

        def handler(req):
            raise httpx.ReadTimeout("slow", request=req)
        client = get_guarded_generation_client(settings(), conn=conn, max_retries=0,
                                               transport=httpx.MockTransport(handler))
        with pytest.raises(ProviderTimeoutError):
            await client.generate_structured(system="sys", prompt="p", schema=SCHEMA, max_tokens=1000)
        row = only_row(conn)
        assert row["reserved"] is False and row["success"] is False and row["estimated"] is True
        assert row["cost"] > estimate_cost_inr(MODEL, 1, 999, 96.0)  # the worst-case hold
    asyncio.run(run())


def test_cancellation_settles_hold_at_worst_case():
    async def run():
        conn = LedgerConn()
        in_flight = asyncio.Event()

        async def handler(req):
            in_flight.set()
            await asyncio.sleep(3600)
        client = get_guarded_generation_client(settings(), conn=conn, max_retries=0,
                                               transport=httpx.MockTransport(handler))
        task = asyncio.create_task(client.generate_structured(system="sys", prompt="p", schema=SCHEMA,
                                                              max_tokens=1000))
        await in_flight.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        await asyncio.sleep(0)                            # let the shielded settle finish
        row = only_row(conn)
        assert row["reserved"] is False                   # no dangling hold
        assert row["success"] is False and row["estimated"] is True
        worst_in = 1 + 1 + -(-len(json.dumps(SCHEMA)) // 4)
        assert row["cost"] == pytest.approx(worst_case_cost_inr(MODEL, worst_in, 1000, 96.0))
    asyncio.run(run())


# --------------------------------------------------------------------------
# Embeddings + Jev usage
# --------------------------------------------------------------------------
def test_embedding_usage_and_per_chunk_reservations():
    async def run():
        s = settings()
        conn = LedgerConn()

        def handler(req):
            n = len(json.loads(req.content)["requests"])
            return httpx.Response(200, json={"embeddings": [{"values": [0.1] * 1536}] * n,
                                             "usageMetadata": {"promptTokenCount": n * 11}})
        raw = GeminiEmbeddingClient(api_key="x", transport=httpx.MockTransport(handler))
        guarded = GuardedEmbeddingClient(raw, ledger=BudgetLedger(conn, settings=s),
                                         cache=AICache(conn, settings=s), settings=s)
        vecs = await guarded.embed([f"text {i}" for i in range(150)])
        assert len(vecs) == 150
        rows = sorted(conn.rows.values(), key=lambda r: r["input_tokens"])
        assert [r["input_tokens"] for r in rows] == [50 * 11, 100 * 11]   # one row per API call
        assert all(r["estimated"] is False and r["reserved"] is False for r in rows)
    asyncio.run(run())


def test_embedding_bad_dims_keeps_billed_usage():
    async def run():
        s = settings()
        conn = LedgerConn()

        def handler(req):
            return httpx.Response(200, json={"embeddings": [{"values": [0.1] * 3}],
                                             "usageMetadata": {"promptTokenCount": 9}})
        raw = GeminiEmbeddingClient(api_key="x", transport=httpx.MockTransport(handler))
        guarded = GuardedEmbeddingClient(raw, ledger=BudgetLedger(conn, settings=s),
                                         cache=AICache(conn, settings=s), settings=s)
        with pytest.raises(ProviderResponseError):
            await guarded.embed(["a"])
        row = only_row(conn)
        assert row["input_tokens"] == 9 and row["success"] is False
    asyncio.run(run())


def _jev(conn, body):
    s = settings()
    inner = JevClient(api_key="k", backend="typesafe", max_retries=0,
                      transport=transport_returning(body))
    return GuardedJevClient(inner, ledger=BudgetLedger(conn, settings=s),
                            cache=AICache(conn, settings=s), settings=s)


def test_jev_usage_cost_is_authoritative_and_zero_is_kept():
    async def run():
        conn = LedgerConn()
        body = {"model": "jev-1.13.0", "answers": {"q": {"type": "noul", "noul": 0.9}},
                "usage": {"input_tokens": 0, "output_tokens": 41, "cost": 0.00002}}
        d = await _jev(conn, body).decide("state", {"q": Noul("is it?")})
        assert d.usage.input_tokens == 0                  # 0 is not treated as missing
        row = only_row(conn)
        assert row["cost"] == pytest.approx(0.00002 * 96.0) and row["estimated"] is False
    asyncio.run(run())


def test_jev_malformed_answer_keeps_billed_cost():
    async def run():
        conn = LedgerConn()
        body = {"model": "jev-1.13.0", "answers": {"q": {"type": "noul"}},
                "usage": {"input_tokens": 400, "output_tokens": 40}}
        with pytest.raises(ProviderResponseError):
            await _jev(conn, body).decide("state", {"q": Noul("is it?")})
        row = only_row(conn)
        assert row["input_tokens"] == 400 and row["success"] is False
        assert row["cost"] == pytest.approx(estimate_cost_inr("jev-latest", 400, 40, 96.0))
    asyncio.run(run())


# --------------------------------------------------------------------------
# Task 3: atomic reserve
# --------------------------------------------------------------------------
def test_reserve_takes_advisory_lock_then_checks_then_inserts_then_commits():
    async def run():
        conn = LedgerConn()
        await BudgetLedger(conn, settings=settings()).reserve("gemini", MODEL, "t", 1.0)
        assert conn.log == ["SELECT pg_advisory_xact_lock %s)", "SELECT COALESCE SUM",
                            "INSERT INTO provider_usage"]
        assert conn.commits == 1 and conn.rollbacks == 0
    asyncio.run(run())


def test_refused_reserve_still_ends_transaction():
    async def run():
        conn = LedgerConn()
        with pytest.raises(BudgetExhaustedError):
            await BudgetLedger(conn, settings=settings(ai_budget_inr=0.5)).reserve("gemini", MODEL, "t", 1.0)
        assert conn.commits == 1 and conn.rows == {}      # lock released, nothing inserted
    asyncio.run(run())


def test_reserve_db_error_rolls_back():
    async def run():
        conn = LedgerConn()
        conn.fail_insert = True
        with pytest.raises(RuntimeError):
            await BudgetLedger(conn, settings=settings()).reserve("gemini", MODEL, "t", 1.0)
        assert conn.rollbacks == 1
    asyncio.run(run())


class SharedDB:
    """Committed rows + an emulated transaction-scoped advisory lock."""

    def __init__(self, honour_lock=True):
        self.rows: dict = {}
        self.lock = asyncio.Lock()
        self.honour_lock = honour_lock


class TxCursor:
    def __init__(self, conn):
        self._c = conn
        self._result = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, sql, params=()):
        await asyncio.sleep(0)                            # let other "clients" interleave
        s = " ".join(sql.split())
        db = self._c.db
        if s.startswith("SELECT pg_advisory_xact_lock"):
            if db.honour_lock:
                await db.lock.acquire()
                self._c.holds_lock = True
        elif s.startswith("SELECT COALESCE(SUM(est_cost_inr)"):
            # READ COMMITTED: sees only committed rows.
            self._result = {"total": sum(db.rows.values())}
        elif s.startswith("INSERT INTO provider_usage"):
            rid, _p, _m, _t, cost = params
            self._c.pending[rid] = cost
        else:
            raise AssertionError("unexpected SQL: " + s)

    async def fetchone(self):
        return self._result


class TxConn:
    """One pooled connection: own transaction, shared committed state."""

    def __init__(self, db):
        self.db = db
        self.pending: dict = {}
        self.holds_lock = False

    def cursor(self, *a, **k):
        return TxCursor(self)

    def _end(self):
        if self.holds_lock:
            self.holds_lock = False
            self.db.lock.release()

    async def commit(self):
        await asyncio.sleep(0)
        self.db.rows.update(self.pending)
        self.pending.clear()
        self._end()

    async def rollback(self):
        self.pending.clear()
        self._end()


async def _race(db, n=12, cap=5.0):
    s = settings(ai_budget_inr=cap)

    async def one():
        try:
            await BudgetLedger(TxConn(db), settings=s).reserve("gemini", MODEL, "t", 1.0)
            return True
        except BudgetExhaustedError:
            return False
    return await asyncio.gather(*(one() for _ in range(n)))


def test_concurrent_reserves_never_overshoot_cap():
    async def run():
        db = SharedDB()
        results = await _race(db)
        assert sum(results) == 5
        assert sum(db.rows.values()) <= 5.0
        assert not db.lock.locked()                       # every transaction ended
    asyncio.run(run())


def test_race_harness_detects_overshoot_without_lock():
    """Sanity check of the harness: without the advisory lock, check-then-
    insert overshoots, so the test above really exercises the lock."""
    async def run():
        db = SharedDB(honour_lock=False)
        await _race(db)
        assert sum(db.rows.values()) > 5.0
    asyncio.run(run())
