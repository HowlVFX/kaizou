"""WS1: ingestion pipeline — prerequisites, placeholders, MERGE_CANDIDATE,
complete claim sets per version, recluster enqueue.

No AI calls and no real DB: classifier / extractor / embeddings are fakes and
the connection is an in-memory emulation of exactly the SQL the service runs.
"""
from __future__ import annotations

import asyncio
import hashlib
import math
import random
import uuid

import pytest

from app.grading.coverage import as_vector
from app.ingestion.classifier import ClassificationResult
from app.ingestion.extractor import ClaimExtractor, ExtractedClaim
from app.ingestion.service import IngestionService, compose_claim_version
from app.memory.mastery import calculate_required_streak, compute_structural_complexity

DIM = 64


# --------------------------------------------------------------------------
# Deterministic fake embeddings
# --------------------------------------------------------------------------
def rand_unit(seed_text: str) -> list[float]:
    rng = random.Random(hashlib.sha256(seed_text.encode()).hexdigest())
    v = [rng.gauss(0, 1) for _ in range(DIM)]
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


def blend(a: list[float], b: list[float], cos: float) -> list[float]:
    """Unit vector with cosine ≈ ``cos`` to ``a`` (b is a random direction)."""
    dot = sum(x * y for x, y in zip(a, b))
    perp = [y - dot * x for x, y in zip(a, b)]
    n = math.sqrt(sum(x * x for x in perp))
    perp = [x / n for x in perp]
    s = math.sqrt(1 - cos * cos)
    return [cos * x + s * y for x, y in zip(a, perp)]


class FakeEmbedding:
    def __init__(self, overrides: dict[str, list[float]] | None = None):
        self.overrides = overrides or {}
        self.calls = 0

    def _vec(self, text: str) -> list[float]:
        return self.overrides.get(text) or rand_unit(text.strip().lower())

    async def compute_embedding(self, text):
        self.calls += 1
        return self._vec(text)

    async def compute_batch_embeddings(self, texts):
        self.calls += 1
        return [self._vec(t) for t in texts]


class FakeClassifier:
    def __init__(self, shape="DEFINITION"):
        self.shape = shape

    async def classify(self, text):
        return ClassificationResult(track="SELF_AUTHORED", shape=self.shape,
                                    category="DETERMINISTIC_MECHANISM", bloom_level=1.0)


class FakeExtractor:
    """claims/prereqs keyed by note body."""

    def __init__(self, claims: dict[str, list[str]], prereqs: dict[str, list[str]]):
        self.claims = claims
        self.prereqs = prereqs
        self.prereq_calls: list[tuple] = []

    async def extract_claims(self, text, shape="DEFINITION"):
        return [ExtractedClaim(text=t, order_index=i) for i, t in enumerate(self.claims.get(text, []))]

    async def extract_prerequisites(self, text, existing_concepts, concept_label="", bloom_level=None):
        self.prereq_calls.append((text, list(existing_concepts), concept_label))
        return list(self.prereqs.get(text, []))


# --------------------------------------------------------------------------
# In-memory DB emulating the service's SQL
# --------------------------------------------------------------------------
class FakeDB:
    def __init__(self):
        self.notes: dict[str, dict] = {}
        self.concepts: dict[str, dict] = {}
        self.claims: list[dict] = []
        self.note_concepts: set[tuple[str, str]] = set()
        self.edges: dict[tuple[str, str, str], dict] = {}
        self.memory_states: dict[tuple[str, str], dict] = {}
        self.jobs: list[dict] = []
        self.commits = 0
        self.rollbacks = 0

    def add_note(self, learner_id, title, body):
        nid = str(uuid.uuid4())
        self.notes[nid] = {"id": nid, "learner_id": learner_id, "title": title, "body_md": body,
                           "markdown_hash": None, "ingestion_status": "PENDING"}
        return nid

    def cursor(self, *a, **k):
        return FakeCursor(self)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1

    def transaction(self):
        raise AssertionError("not used")


class FakeCursor:
    def __init__(self, db: FakeDB):
        self.db = db
        self._rows: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def fetchone(self):
        return self._rows[0] if self._rows else None

    async def fetchall(self):
        return list(self._rows)

    async def execute(self, sql, params=()):  # noqa: C901 - one branch per statement
        db = self.db
        s = " ".join(sql.split())
        p = list(params)
        self._rows = []

        if s.startswith("SELECT * FROM notes WHERE id"):
            n = db.notes.get(p[0])
            self._rows = [dict(n)] if n and n["learner_id"] == p[1] else []
        elif s.startswith("UPDATE notes SET ingestion_status = 'READY', markdown_hash"):
            db.notes[p[1]].update(ingestion_status="READY", markdown_hash=p[0])
        elif s.startswith("UPDATE notes SET ingestion_status = 'READY'"):
            db.notes[p[0]]["ingestion_status"] = "READY"
        elif s.startswith("UPDATE notes SET ingestion_status = 'FAILED'"):
            db.notes[p[0]]["ingestion_status"] = "FAILED"
        elif s.startswith("SELECT id, canonical_label AS label, label_embedding AS embedding, status::text"):
            self._rows = [
                {"id": uuid.UUID(c["id"]), "label": c["canonical_label"],
                 "embedding": "[" + ",".join(str(x) for x in c["label_embedding"]) + "]",
                 "status": c["status"]}
                for c in db.concepts.values() if c["learner_id"] == p[0] and c["label_embedding"]
            ]
        elif s.startswith("DELETE FROM note_concepts WHERE note_id"):
            db.note_concepts = {(n, c) for n, c in db.note_concepts if not (n == p[0] and c != p[1])}
        elif s.startswith("SELECT COUNT(*) AS n FROM note_concepts"):
            self._rows = [{"n": sum(1 for n, c in db.note_concepts if c == p[0] and n != p[1])}]
        elif s.startswith("INSERT INTO concepts") and "'UNRESOLVED_PREREQUISITE'" in s:
            cid, lid, label, emb, track, shape, cat = p
            db.concepts[cid] = {"id": cid, "learner_id": lid, "canonical_label": label,
                                "label_embedding": as_vector(emb), "track": track, "shape": shape,
                                "category": cat, "status": "UNRESOLVED_PREREQUISITE", "version": 1,
                                "probe_eligible": False, "c_struct": None, "c_0": None, "n_req": None}
        elif s.startswith("INSERT INTO concepts"):
            (cid, lid, label, emb, track, shape, cat, c_struct, c_bloom, c_0, c_cur, n_req) = p
            db.concepts[cid] = {"id": cid, "learner_id": lid, "canonical_label": label,
                                "label_embedding": as_vector(emb), "track": track, "shape": shape,
                                "category": cat, "status": "VERIFIED_CONCEPT", "version": 1,
                                "probe_eligible": True, "c_struct": c_struct, "c_bloom": c_bloom,
                                "c_0": c_0, "c_current": c_cur, "n_req": n_req}
        elif s.startswith("UPDATE concepts SET canonical_label"):
            (label, emb, track, shape, cat, c_struct, c_bloom, c_0, c_cur, n_req, cid) = p
            db.concepts[cid].update(canonical_label=label, label_embedding=as_vector(emb), track=track,
                                    shape=shape, category=cat, status="VERIFIED_CONCEPT",
                                    probe_eligible=True, c_struct=c_struct, c_bloom=c_bloom,
                                    c_0=c_0, c_current=c_cur, n_req=n_req)
            self._rows = [{"version": db.concepts[cid]["version"]}]
        elif s.startswith("INSERT INTO memory_states"):
            db.memory_states.setdefault((p[0], p[1]), {"half_life": p[2]})
        elif s.startswith("UPDATE concepts SET version = version + 1"):
            c = db.concepts[p[0]]
            c["version"] += 1
            self._rows = [{"version": c["version"], "c_0": c["c_0"], "shape": c["shape"], "n_req": c["n_req"]}]
        elif s.startswith("UPDATE concepts SET n_req"):
            if db.concepts[p[1]]["n_req"] is None:
                db.concepts[p[1]]["n_req"] = p[0]
        elif s.startswith("SELECT text, embedding, order_index"):
            self._rows = [
                {**c, "embedding": "[" + ",".join(str(x) for x in c["embedding"]) + "]"}
                for c in db.claims if c["concept_id"] == p[0] and c["concept_version"] == p[1]
            ]
        elif s.startswith("INSERT INTO claims"):
            (cid, ver, text, emb, order, is_t, is_lb, branch, weight, aliases) = p
            db.claims.append({"concept_id": cid, "concept_version": ver, "text": text,
                              "embedding": as_vector(emb), "order_index": order,
                              "is_transition": is_t, "is_load_bearing": is_lb,
                              "branch_id": branch, "weight": weight, "aliases": aliases})
        elif s.startswith("INSERT INTO note_concepts"):
            db.note_concepts.add((p[0], p[1]))
        elif s.startswith("SELECT source_id, target_id, flag::text AS flag FROM edges"):
            self._rows = [
                {"source_id": uuid.UUID(e["source_id"]), "target_id": uuid.UUID(e["target_id"]),
                 "flag": e["flag"]}
                for e in db.edges.values() if e["learner_id"] == p[0] and e["type"] == "REQUIRES"
            ]
        elif s.startswith("DELETE FROM edges WHERE source_id"):
            db.edges = {k: v for k, v in db.edges.items() if not (k[0] == p[0] and k[2] == "REQUIRES")}
        elif s.startswith("INSERT INTO edges") and "'REQUIRES'" in s:
            lid, src, tgt, flag = p
            db.edges.setdefault((src, tgt, "REQUIRES"), {"learner_id": lid, "source_id": src,
                                                         "target_id": tgt, "type": "REQUIRES",
                                                         "flag": flag, "weight": 1.0})
        elif s.startswith("INSERT INTO edges") and "'MERGE_CANDIDATE'" in s:
            lid, src, tgt, w, conf = p
            e = db.edges.setdefault((src, tgt, "SEMANTIC"), {"learner_id": lid, "source_id": src,
                                                             "target_id": tgt, "type": "SEMANTIC",
                                                             "weight": w})
            e.update(flag="MERGE_CANDIDATE", confidence=conf)
        elif s.startswith("SELECT id FROM concepts WHERE learner_id = %s AND LOWER(canonical_label)"):
            self._rows = [{"id": uuid.UUID(c["id"])} for c in db.concepts.values()
                          if c["learner_id"] == p[0] and c["canonical_label"].lower() == p[1].lower()]
        elif s.startswith("INSERT INTO edges") and "'WIKILINK'" in s:
            lid, src, tgt = p
            db.edges.setdefault((src, tgt, "WIKILINK"), {"learner_id": lid, "source_id": src,
                                                         "target_id": tgt, "type": "WIKILINK",
                                                         "flag": None, "weight": 1.0})
        elif s.startswith("INSERT INTO edges") and "'SEMANTIC'" in s:
            lid, src, tgt, w, conf = p
            db.edges.setdefault((src, tgt, "SEMANTIC"), {"learner_id": lid, "source_id": src,
                                                         "target_id": tgt, "type": "SEMANTIC",
                                                         "flag": None, "weight": w, "confidence": conf})
        elif s.startswith("INSERT INTO jobs"):
            (jid, jtype, payload, run_after, max_attempts, jtype2, dedupe) = p
            dedupe = dedupe.obj
            exists = any(j["job_type"] == jtype2 and j["status"] == "PENDING"
                         and all(j["payload"].get(k) == v for k, v in dedupe.items())
                         for j in db.jobs)
            if not exists:
                db.jobs.append({"id": jid, "job_type": jtype, "payload": payload.obj,
                                "status": "PENDING", "run_after": run_after})
                self._rows = [{"id": jid}]
        else:
            raise AssertionError("unexpected SQL: " + s)


LEARNER = str(uuid.uuid4())


def make_service(db, extractor, embedding=None, shape="DEFINITION"):
    return IngestionService(db, classifier=FakeClassifier(shape), extractor=extractor,
                            embedding_service=embedding or FakeEmbedding())


def by_label(db, label):
    return [c for c in db.concepts.values() if c["canonical_label"].lower() == label.lower()]


def claims_of(db, cid, version):
    return [c["text"] for c in db.claims if c["concept_id"] == cid and c["concept_version"] == version]


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------
def test_prerequisite_creates_placeholder_and_requires_edge():
    async def run():
        db = FakeDB()
        body = "Hoisting moves declarations up."
        ex = FakeExtractor({body: ["Declarations are hoisted.", "Initialisation is not."]},
                           {body: ["Creation Phase"]})
        nid = db.add_note(LEARNER, "Hoisting", body)
        res = await make_service(db, ex).ingest_note(nid, LEARNER)

        hoist = by_label(db, "Hoisting")[0]
        ph = by_label(db, "Creation Phase")[0]
        assert res["status"] == "READY" and res["placeholders_created"] == 1
        assert ph["status"] == "UNRESOLVED_PREREQUISITE" and ph["probe_eligible"] is False
        assert (ph["id"], LEARNER) not in db.memory_states  # never scheduled for review
        # DB orientation: source REQUIRES target
        edge = db.edges[(hoist["id"], ph["id"], "REQUIRES")]
        assert edge["flag"] is None
        # depth 1 fed into C_struct; N_req frozen from C_0
        assert hoist["c_struct"] == pytest.approx(
            compute_structural_complexity(2, 1, len(body.split())))
        assert hoist["n_req"] == calculate_required_streak(hoist["c_0"], False)
        # recluster enqueued in the same transaction
        assert [j["job_type"] for j in db.jobs] == ["WEEKLY_CLUSTER"]
        assert db.jobs[0]["payload"]["learner_id"] == LEARNER
        assert db.notes[nid]["ingestion_status"] == "READY"
    asyncio.run(run())


def test_placeholder_is_promoted_not_duplicated_and_job_deduped():
    async def run():
        db = FakeDB()
        b1, b2 = "Hoisting body", "Creation phase body"
        ex = FakeExtractor({b1: ["c1"], b2: ["cp1", "cp2"]}, {b1: ["Creation Phase"]})
        emb = FakeEmbedding()
        svc = make_service(db, ex, emb)
        await svc.ingest_note(db.add_note(LEARNER, "Hoisting", b1), LEARNER)
        ph_id = by_label(db, "Creation Phase")[0]["id"]

        res = await svc.ingest_note(db.add_note(LEARNER, "creation phase", b2), LEARNER)

        matches = by_label(db, "Creation Phase")
        assert len(matches) == 1 and matches[0]["id"] == ph_id == res["concept_id"]
        c = matches[0]
        assert c["status"] == "VERIFIED_CONCEPT" and c["probe_eligible"] is True
        assert c["n_req"] is not None and c["c_0"] is not None
        assert (ph_id, LEARNER) in db.memory_states
        assert sorted(claims_of(db, ph_id, c["version"])) == ["cp1", "cp2"]
        # REQUIRES edge from the first note still points at the promoted id
        hoist = by_label(db, "Hoisting")[0]
        assert (hoist["id"], ph_id, "REQUIRES") in db.edges
        # still one pending recluster job for the learner
        assert len(db.jobs) == 1
    asyncio.run(run())


def test_prerequisite_resolves_to_existing_concept_by_label():
    async def run():
        db = FakeDB()
        b1, b2 = "closures body", "currying body"
        ex = FakeExtractor({b1: ["x"], b2: ["y"]}, {b2: ["closures"]})
        svc = make_service(db, ex)
        await svc.ingest_note(db.add_note(LEARNER, "Closures", b1), LEARNER)
        await svc.ingest_note(db.add_note(LEARNER, "Currying", b2), LEARNER)
        assert len(db.concepts) == 2  # no placeholder
        cur, clo = by_label(db, "Currying")[0], by_label(db, "Closures")[0]
        assert (cur["id"], clo["id"], "REQUIRES") in db.edges
        # existing labels were offered to the prerequisite extractor
        assert "Closures" in ex.prereq_calls[-1][1]
        assert cur["c_struct"] == pytest.approx(compute_structural_complexity(1, 1, 2))
    asyncio.run(run())


def test_cycle_is_flagged_cycle_conflict():
    async def run():
        db = FakeDB()
        ba, bb = "A body", "B body"
        ex = FakeExtractor({ba: ["a"], bb: ["b"]}, {ba: ["Beta"], bb: ["Alpha"]})
        svc = make_service(db, ex)
        await svc.ingest_note(db.add_note(LEARNER, "Alpha", ba), LEARNER)  # Alpha REQUIRES Beta(placeholder)
        await svc.ingest_note(db.add_note(LEARNER, "Beta", bb), LEARNER)   # Beta REQUIRES Alpha → cycle
        a, b = by_label(db, "Alpha")[0], by_label(db, "Beta")[0]
        assert db.edges[(a["id"], b["id"], "REQUIRES")]["flag"] is None
        assert db.edges[(b["id"], a["id"], "REQUIRES")]["flag"] == "CYCLE_CONFLICT"
    asyncio.run(run())


def test_merge_candidate_edge_recorded():
    async def run():
        db = FakeDB()
        base = rand_unit("event loop")
        near = blend(base, rand_unit("other"), 0.86)  # ambiguous band 0.82–0.90
        emb = FakeEmbedding({"Event Loop": base, "JS Event Loop": near})
        b1, b2 = "loop body", "js loop body"
        ex = FakeExtractor({b1: ["l1"], b2: ["l2"]}, {})
        svc = make_service(db, ex, emb)
        await svc.ingest_note(db.add_note(LEARNER, "Event Loop", b1), LEARNER)
        res = await svc.ingest_note(db.add_note(LEARNER, "JS Event Loop", b2), LEARNER)
        assert res["is_new_concept"] is True
        old = by_label(db, "Event Loop")[0]
        e = db.edges[(res["concept_id"], old["id"], "SEMANTIC")]
        assert e["flag"] == "MERGE_CANDIDATE"
        assert 0.82 <= e["confidence"] < 0.90
    asyncio.run(run())


def test_reingest_sole_source_replaces_claim_set_at_new_version():
    async def run():
        db = FakeDB()
        v1_body, v2_body = "old body", "new body"
        ex = FakeExtractor({v1_body: ["keep me", "drop me"], v2_body: ["keep me", "brand new"]},
                           {v1_body: ["Old Prereq"], v2_body: ["New Prereq"]})
        svc = make_service(db, ex)
        nid = db.add_note(LEARNER, "Topic", v1_body)
        await svc.ingest_note(nid, LEARNER)
        db.notes[nid]["body_md"] = v2_body
        res = await svc.ingest_note(nid, LEARNER)

        c = by_label(db, "Topic")[0]
        assert c["version"] == 2 and res["concept_version"] == 2
        assert sorted(claims_of(db, c["id"], 2)) == ["brand new", "keep me"]
        assert sorted(claims_of(db, c["id"], 1)) == ["drop me", "keep me"]  # v1 immutable
        # prerequisite list superseded too
        req = [k for k in db.edges if k[0] == c["id"] and k[2] == "REQUIRES"]
        assert [db.concepts[t]["canonical_label"] for _, t, _ in req] == ["New Prereq"]
    asyncio.run(run())


def test_shared_concept_carries_forward_full_claim_set():
    async def run():
        db = FakeDB()
        b1, b2 = "note one", "note two"
        ex = FakeExtractor({b1: ["first claim", "second claim"],
                            b2: ["second claim", "third claim"]}, {})
        svc = make_service(db, ex)
        await svc.ingest_note(db.add_note(LEARNER, "Recursion", b1), LEARNER)
        res = await svc.ingest_note(db.add_note(LEARNER, "Recursion", b2), LEARNER)  # same concept
        c = by_label(db, "Recursion")[0]
        assert res["is_new_concept"] is False and c["version"] == 2
        v2 = [cl for cl in db.claims if cl["concept_id"] == c["id"] and cl["concept_version"] == 2]
        assert sorted(x["text"] for x in v2) == ["first claim", "second claim", "third claim"]
        assert res["claims_count"] == 1  # only "third claim" is new
        third = next(x for x in v2 if x["text"] == "third claim")
        assert third["order_index"] == 2 + 1  # appended after carried order 0..1
    asyncio.run(run())


def test_unchanged_note_commits_and_skips_ai():
    async def run():
        db = FakeDB()
        body = "same"
        ex = FakeExtractor({body: ["c"]}, {})
        emb = FakeEmbedding()
        svc = make_service(db, ex, emb)
        nid = db.add_note(LEARNER, "Same", body)
        await svc.ingest_note(nid, LEARNER)
        calls = emb.calls
        res = await svc.ingest_note(nid, LEARNER)
        assert res["status"] == "UNCHANGED" and emb.calls == calls
    asyncio.run(run())


def test_failure_marks_note_failed_and_rolls_back():
    class Boom(FakeExtractor):
        async def extract_prerequisites(self, *a, **k):
            raise RuntimeError("provider down")

    async def run():
        db = FakeDB()
        body = "b"
        svc = make_service(db, Boom({body: ["c"]}, {}))
        nid = db.add_note(LEARNER, "T", body)
        with pytest.raises(RuntimeError):
            await svc.ingest_note(nid, LEARNER)
        assert db.rollbacks == 1 and db.notes[nid]["ingestion_status"] == "FAILED"
    asyncio.run(run())


# --------------------------------------------------------------------------
# Pure helpers
# --------------------------------------------------------------------------
def _claim(text, order=None):
    return {"text": text, "embedding": rand_unit(text), "order_index": order,
            "is_transition": False, "is_load_bearing": False, "branch_id": None,
            "weight": 1.0, "aliases": []}


def test_compose_claim_version_modes():
    prev = [_claim("a", 0), _claim("b", 1)]
    new = [_claim("b", 0), _claim("c", 1)]
    carried = compose_claim_version(prev, new, replace=False)
    assert [c["text"] for c in carried] == ["a", "b", "c"]
    assert [c["carried"] for c in carried] == [True, True, False]
    assert carried[-1]["order_index"] == 3
    replaced = compose_claim_version(prev, new, replace=True)
    assert [c["text"] for c in replaced] == ["b", "c"]
    # empty re-extraction never wipes the key
    assert [c["text"] for c in compose_claim_version(prev, [], replace=True)] == ["a", "b"]


# --------------------------------------------------------------------------
# Extractor prompt / cache variant (fake generation client)
# --------------------------------------------------------------------------
class FakeGen:
    def __init__(self, data):
        self.data = data
        self.kwargs = None

    async def generate_structured(self, **kwargs):
        self.kwargs = kwargs

        class R:
            pass
        r = R()
        r.data = self.data
        return r


def test_extract_prerequisites_prompt_variant_and_filtering():
    async def run():
        gen = FakeGen({"prerequisites": ["Closures", "closures", "Hoisting", "  Scope  chain ", 5]})
        ex = ClaimExtractor(client=gen)
        out = await ex.extract_prerequisites("text", [], concept_label="Hoisting")
        assert out == ["Closures", "Scope chain"]  # dedupe, self removed, whitespace, non-str
        assert gen.kwargs["variant"] == ClaimExtractor.PREREQ_VARIANT
        assert '"Hoisting"' in gen.kwargs["system"] and "(none)" in gen.kwargs["system"]
        assert "{concepts}" not in gen.kwargs["system"]
    asyncio.run(run())


def test_prerequisites_are_capped_at_the_notes_level():
    from app.ingestion.extractor import note_level_band
    kid = ("Plants make their own food. They use sunlight, water and air to do it. "
           "The food they make is sugar. The green stuff in leaves catches the sunlight.")
    tech = ("Photosynthesis is a biochemical process whereby photoautotrophic organisms convert "
            "electromagnetic radiation into chemical energy via the Calvin-Benson cycle.")
    assert note_level_band(kid) == "young_child"
    assert note_level_band(kid, bloom_level=2.0) == "young_child"   # a child applying an idea is still a child
    assert note_level_band(tech) == "expert"

    async def run():
        gen = FakeGen({"prerequisites": [
            {"label": "Sunlight", "level": "young_child"},
            {"label": "Cell biology", "level": "university"},
            {"label": "Adenosine triphosphate", "level": "expert"},
            {"label": "Sugar", "level": "young_child"},
            {"label": "Water", "level": "young_child"},
        ]})
        out = await ClaimExtractor(client=gen).extract_prerequisites(kid, [], concept_label="Plant food")
        assert out == ["Sunlight", "Sugar"]          # above-level dropped, capped at 2 for a child
        assert "a young child" in gen.kwargs["system"]
    asyncio.run(run())
