"""In-memory stand-ins for the DB and AI providers used by the WS2 tests.

FakeDB understands exactly the SQL issued by the probes / grading / memory
services (matched by distinctive fragments) and keeps table state in dicts,
so the full grade → attempt → memory → mastery → SOLO path can run without
Postgres. No network, no paid AI.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.config import Settings
from app.providers.generation.base import StructuredResult


def settings(**overrides) -> Settings:
    base = dict(_env_file=None, nli_enabled=False, internal_api_key="test-key")
    base.update(overrides)
    return Settings(**base)


def _jsonb(v):
    return getattr(v, "obj", v)


class FakeDB:
    def __init__(self):
        self.concepts: dict[str, dict] = {}
        self.claims: list[dict] = []
        self.probes: dict[str, dict] = {}
        self.memory: dict[tuple[str, str], dict] = {}
        self.attempts: list[dict] = []
        self.misconceptions: list[dict] = []
        self.capability_events: list[dict] = []
        self.edges: list[dict] = []
        self.log: list[str] = []
        self.commits = 0

    # -- seeding -------------------------------------------------------------
    def add_concept(self, learner_id, **kw) -> str:
        cid = kw.pop("id", None) or str(uuid.uuid4())
        row = dict(id=cid, learner_id=learner_id, canonical_label="Concept",
                   track="SOURCE_BACKED", shape="DEFINITION", category="DETERMINISTIC_MECHANISM",
                   status="VERIFIED_CONCEPT", version=1, c_0=1.0, c_current=1.0, n_req=None,
                   solo_level="Prestructural", probe_eligible=True)
        row.update(kw)
        self.concepts[cid] = row
        return cid

    def add_claim(self, concept_id, text, **kw) -> str:
        row = dict(id=str(uuid.uuid4()), concept_id=concept_id, concept_version=1, text=text,
                   embedding=None, order_index=None, is_transition=False, is_load_bearing=False,
                   branch_id=None, weight=1.0, aliases=[])
        row.update(kw)
        self.claims.append(row)
        return row["id"]

    def add_memory(self, concept_id, learner_id, **kw):
        row = dict(concept_id=concept_id, learner_id=learner_id, half_life=1.0, last_reviewed=None,
                   streak=0, attempts=0, passes=0, decay_exempt=False, mastered_at=None,
                   stagnation_clock=0)
        row.update(kw)
        self.memory[(concept_id, learner_id)] = row

    def add_probe(self, concept_id, ptype, snapshot, version=1) -> str:
        pid = str(uuid.uuid4())
        self.probes[pid] = dict(id=pid, concept_id=concept_id, concept_version=version, type=ptype,
                                prompt_text="q", answer_key_snapshot=snapshot, payload={},
                                leaked=False, retries=0)
        return pid

    # -- psycopg surface -----------------------------------------------------
    def cursor(self, row_factory=None):
        return FakeCursor(self)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


class FakeCursor:
    def __init__(self, db: FakeDB):
        self.db = db
        self._rows: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def fetchone(self):
        return self._rows[0] if self._rows else None

    async def fetchall(self):
        return list(self._rows)

    async def execute(self, sql: str, params=()):
        db = self.db
        s = " ".join(sql.split())
        db.log.append(s)
        p = list(params or ())
        self._rows = []

        if s.startswith("SELECT * FROM concepts WHERE id"):
            c = db.concepts.get(str(p[0]))
            self._rows = [dict(c)] if c else []
        elif "FROM claims WHERE concept_id = %s AND concept_version = %s AND is_transition" in s:
            self._rows = [{"id": c["id"]} for c in db.claims
                          if c["concept_id"] == p[0] and c["concept_version"] == p[1] and c["is_transition"]]
        elif "FROM claims WHERE concept_id = %s AND concept_version = %s" in s:
            rows = [dict(c) for c in db.claims if c["concept_id"] == str(p[0]) and c["concept_version"] == p[1]]
            rows.sort(key=lambda r: (r["order_index"] is None, r["order_index"] or 0))
            self._rows = rows
        elif "FROM probes p JOIN attempts a" in s:
            lid, cid = str(p[0]), str(p[1])
            seen = {}
            for a in db.attempts:
                if a["learner_id"] == lid and a["concept_id"] == cid:
                    seen[db.probes[a["probe_id"]]["type"]] = a["submitted_at"]
            self._rows = [{"type": t, "last_at": at} for t, at in
                          sorted(seen.items(), key=lambda kv: kv[1], reverse=True)]
        elif s.startswith("INSERT INTO probes"):
            pid = str(uuid.uuid4())
            db.probes[pid] = dict(id=pid, concept_id=str(p[0]), concept_version=p[1], type=p[2],
                                  prompt_text=p[3], answer_key_snapshot=_jsonb(p[4]),
                                  payload=_jsonb(p[5]), leaked=p[6], retries=p[7])
            self._rows = [{"id": pid}]
        elif "FROM probes p JOIN concepts c" in s:
            pr = db.probes.get(str(p[0]))
            if pr:
                c = db.concepts[pr["concept_id"]]
                self._rows = [dict(pr, concept_learner_id=c["learner_id"])]
        elif s.startswith("SELECT c_current FROM concepts"):
            c = db.concepts.get(str(p[0]))
            self._rows = [{"c_current": c["c_current"]}] if c else []
        elif s.startswith("INSERT INTO memory_states"):
            key = (str(p[0]), str(p[1]))
            if key not in db.memory:
                db.add_memory(key[0], key[1], half_life=p[2])
        elif "FROM memory_states ms JOIN concepts c" in s:
            m = db.memory.get((str(p[0]), str(p[1])))
            if m:
                c = db.concepts[m["concept_id"]]
                self._rows = [dict(m, complexity=c["c_current"], shape=c["shape"], solo_level=c["solo_level"])]
        elif s.startswith("INSERT INTO attempts"):
            aid = str(uuid.uuid4())
            cols = ["learner_id", "probe_id", "concept_id", "concept_version", "answer_text",
                    "answer_payload", "confidence_pre", "coverage", "ordering", "precision_score",
                    "verbatim", "branch_leakage", "delta_score", "ari_mechanism", "ari_surface",
                    "principle_ratio", "composite_score", "band", "predicted_recall", "passed",
                    "gap_report"]
            row = {k: _jsonb(v) for k, v in zip(cols, p)}
            row.update(id=aid, submitted_at=datetime.now(timezone.utc).timestamp() + len(db.attempts))
            db.attempts.append(row)
            self._rows = [{"id": aid}]
        elif s.startswith("INSERT INTO misconception_events"):
            db.misconceptions.append(dict(learner_id=p[0], concept_id=p[1], attempt_id=p[2], tag=p[3]))
        elif s.startswith("INSERT INTO capability_events"):
            # Capability timeline (§5.25.1). Both the attempt-tagged and the
            # SOLO_ADVANCE variants land here; record enough to assert on.
            db.capability_events.append(dict(learner_id=p[0], concept_id=p[1],
                                             rest=list(p[2:])))
        elif s.startswith("UPDATE memory_states SET half_life"):
            m = db.memory[(str(p[5]), str(p[6]))]
            m.update(half_life=p[0], last_reviewed=p[1], streak=p[2], attempts=p[3], passes=p[4])
        elif s.startswith("UPDATE memory_states SET mastered_at"):
            m = db.memory[(str(p[0]), str(p[1]))]
            if m["mastered_at"] is None:
                m["mastered_at"] = datetime.now(timezone.utc)
        elif s.startswith("UPDATE concepts SET c_current"):
            db.concepts[str(p[1])]["c_current"] = p[0]
        elif s.startswith("UPDATE concepts SET n_req"):
            c = db.concepts[str(p[1])]
            if c["n_req"] is None:
                c["n_req"] = p[0]
        elif s.startswith("UPDATE concepts SET solo_level"):
            db.concepts[str(p[1])]["solo_level"] = p[0]
        elif "FROM concepts c JOIN memory_states ms ON ms.concept_id = c.id AND ms.learner_id = %s" in s:
            lid, cid = str(p[0]), str(p[1])
            m = db.memory.get((cid, lid))
            c = db.concepts.get(cid)
            if m and c:
                self._rows = [dict(shape=c["shape"], c_0=c["c_0"], c_current=c["c_current"],
                                   n_req=c["n_req"], version=c["version"], streak=m["streak"],
                                   attempts=m["attempts"], passes=m["passes"],
                                   mastered_at=m["mastered_at"])]
        elif "a.gap_report->'grading'->'matched_claim_ids'" in s:
            cid, lid, k = str(p[0]), str(p[1]), p[2]
            rows = [a for a in db.attempts if a["concept_id"] == cid and a["learner_id"] == lid]
            rows.sort(key=lambda a: a["submitted_at"], reverse=True)
            self._rows = [{"composite_score": a["composite_score"],
                           "type": db.probes[a["probe_id"]]["type"],
                           "matched_ids": (a["gap_report"].get("grading") or {}).get("matched_claim_ids")}
                          for a in rows[:k]]
        elif s.startswith("SELECT solo_level::text"):
            c = db.concepts.get(str(p[0]))
            self._rows = [{"solo_level": c["solo_level"]}] if c else []
        elif "AS max_matched" in s:
            cid, lid = str(p[0]), str(p[1])
            rows = [a for a in db.attempts if a["concept_id"] == cid and a["learner_id"] == lid]
            g = lambda a: a["gap_report"].get("grading") or {}
            ptype = lambda a: db.probes[a["probe_id"]]["type"]
            pert = [a["delta_score"] for a in rows if ptype(a) == "PERTURBATION" and a["passed"] and a["delta_score"] is not None]
            far = [a["composite_score"] for a in rows if ptype(a) == "FAR_TRANSFER" and a["passed"]]
            self._rows = [{
                "max_matched": max([int(g(a).get("total_matched") or 0) for a in rows] or [0]),
                "transition_types": len({ptype(a) for a in rows if g(a).get("all_transitions_matched") is True}),
                "best_perturbation": max(pert) if pert else None,
                "best_far_transfer": max(far) if far else None,
            }]
        elif "LEFT JOIN memory_states ms" in s:
            lid = str(p[0])
            out = []
            for c in db.concepts.values():
                if c["learner_id"] != lid:
                    continue
                m = db.memory.get((c["id"], lid)) or {}
                out.append(dict(concept_id=c["id"], concept_label=c["canonical_label"],
                                complexity=c["c_current"], solo_level=c["solo_level"],
                                status=c["status"], probe_eligible=c["probe_eligible"],
                                ms_concept_id=m.get("concept_id"), half_life=m.get("half_life"),
                                last_reviewed=m.get("last_reviewed"), decay_exempt=m.get("decay_exempt"),
                                streak=m.get("streak"), mastered_at=m.get("mastered_at")))
            self._rows = out
        elif "FROM edges WHERE learner_id" in s:
            self._rows = [dict(e) for e in db.edges if e["learner_id"] == str(p[0])]
        elif s.startswith("SELECT n.body_md FROM notes n JOIN note_concepts"):
            body = getattr(db, "note_bodies", {}).get(str(p[0]))
            self._rows = [{"body_md": body}] if body else []
        elif s.startswith("SELECT COUNT(*) AS n FROM probes WHERE concept_id"):
            cid, ver, typ = str(p[0]), p[1], p[2]
            n = sum(1 for pr in db.probes.values()
                    if pr["concept_id"] == cid and pr["concept_version"] == ver and pr["type"] == typ)
            self._rows = [{"n": n}]
        else:
            raise AssertionError(f"FakeDB: unexpected SQL: {s[:160]}")


class FakeGenClient:
    """Returns queued structured outputs; records every call."""

    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls: list[dict] = []

    async def generate_structured(self, **kwargs):
        self.calls.append(kwargs)
        out = self.outputs.pop(0) if self.outputs else {"prompt_text": "Explain it."}
        if isinstance(out, Exception):
            raise out
        return StructuredResult(data=out, model="fake", provider="fake")


class FakeEmbedding:
    """Deterministic bag-of-words vectors: identical text → cosine 1.0."""

    DIM = 64

    def __init__(self):
        self.calls = 0

    def _vec(self, text: str) -> list[float]:
        v = [0.0] * self.DIM
        for w in text.lower().replace(".", " ").split():
            v[hash(w) % self.DIM] += 1.0
        return v

    async def compute_embedding(self, text):
        self.calls += 1
        return self._vec(text)

    async def compute_batch_embeddings(self, texts):
        self.calls += 1
        return [self._vec(t) for t in texts]
