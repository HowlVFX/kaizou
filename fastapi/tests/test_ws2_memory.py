"""WS2 memory & review: queue priorities for new concepts, real centrality,
real detour rows, mastery + SOLO after grading, /review/answer end to end
(FakeDB, fake embeddings, NLI disabled — no AI, no Postgres)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.grading.answer_key import build_snapshot
from app.grading.service import GradingService, GradingServiceError
from app.memory.scheduler import build_review_queue, compute_centrality
from app.memory.service import MemoryService
from test_ws2_support import FakeDB, FakeEmbedding, settings

L = "11111111-1111-1111-1111-111111111111"


def run(coro):
    return asyncio.run(coro)


# --- centrality ------------------------------------------------------------
def test_centrality_hub_is_highest_and_normalised():
    c = compute_centrality(["hub", "a", "b", "c", "lone"],
                           [("hub", "a", 1.0), ("hub", "b", 1.0), ("hub", "c", 1.0)])
    assert c["hub"] == pytest.approx(1.0)
    assert 0 < c["a"] < 1.0 and c["lone"] < c["a"]
    assert compute_centrality(["x", "y"], []) == {"x": 1.0, "y": 1.0}


# --- queue -----------------------------------------------------------------
def test_new_concepts_are_due_and_prioritised():
    db = FakeDB()
    now = datetime.now(timezone.utc)
    fresh = db.add_concept(L, canonical_label="Fresh")            # never reviewed
    db.add_memory(fresh, L)
    stale = db.add_concept(L, canonical_label="Stale")
    db.add_memory(stale, L, last_reviewed=now - timedelta(days=3), half_life=1.0)
    recent = db.add_concept(L, canonical_label="Recent")          # R≈1 → not due
    db.add_memory(recent, L, last_reviewed=now - timedelta(hours=13), half_life=30.0)
    mastered = db.add_concept(L, canonical_label="Mastered")
    db.add_memory(mastered, L, mastered_at=now)

    q = run(MemoryService(db, settings=settings()).get_review_queue(L, 8))
    labels = [i["concept_label"] for i in q]
    assert labels[0] == "Fresh" and "Stale" in labels
    assert "Recent" not in labels and "Mastered" not in labels
    assert q[0]["is_new"] is True and q[0]["priority_score"] > 0


def test_detour_uses_real_prerequisite_row_and_requires_direction():
    db = FakeDB()
    now = datetime.now(timezone.utc)
    dep = db.add_concept(L, canonical_label="Closures", solo_level="Relational", c_current=1.5)
    db.add_memory(dep, L, last_reviewed=now - timedelta(days=1), half_life=2.0)   # R≈0.71
    pre = db.add_concept(L, canonical_label="Scope", solo_level="Unistructural", c_current=0.7)
    db.add_memory(pre, L, last_reviewed=now - timedelta(days=10), half_life=5.0, mastered_at=now)  # R=0.25
    locked = db.add_concept(L, canonical_label="Lexical env", status="UNRESOLVED_PREREQUISITE")
    # source requires target → target is the prerequisite
    db.edges += [
        dict(learner_id=L, source_id=dep, target_id=pre, type="REQUIRES", weight=0.6, flag=None),
        dict(learner_id=L, source_id=dep, target_id=locked, type="REQUIRES", weight=0.6, flag=None),
    ]
    s = settings(review_forgetting_threshold=0.9)
    q = run(MemoryService(db, settings=s).get_review_queue(L, 8))
    assert [i["concept_label"] for i in q][:2] == ["Scope", "Closures"]
    detour = q[0]
    assert detour["is_detour"] and detour["concept_id"] == pre and detour["detour_for"] == dep
    assert detour["solo_level"] == "Unistructural" and detour["complexity"] == 0.7
    assert "Scope" in detour["detour_reason"] and "Closures" in detour["detour_reason"]
    assert q[1]["prerequisite_gaps"] == [{"concept_id": locked, "concept_label": "Lexical env"}]


def test_build_queue_never_emits_placeholder_detours():
    cands = [{"concept_id": "v", "concept_label": "V", "recall_probability": 0.5,
              "priority_score": 0.5, "prereq_recalls": {"unknown": 0.1}}]
    q = build_review_queue(cands, 8, concept_index={})
    assert [i.concept_id for i in q] == ["v"]


# --- grading → memory → mastery → SOLO ------------------------------------
def seed_graded(ptype="MISCONCEPTION_MCQ"):
    db = FakeDB()
    cid = db.add_concept(L, canonical_label="TCP", c_0=0.5)
    k0 = db.add_claim(cid, "The server replies with a SYN-ACK packet.", is_transition=True)
    concept = dict(db.concepts[cid])
    claims = [c for c in db.claims if c["concept_id"] == cid]
    return db, cid, k0, concept, claims


def mcq_probe(db, cid, concept, claims):
    snap = build_snapshot(concept=concept, claims=claims, probe_type="MISCONCEPTION_MCQ",
                          target_claim_index=0,
                          mcq={"correct_index": 0, "n_options": 4,
                               "distractor_map": {"1": "m1", "2": "m2", "3": "m3"}})
    return db.add_probe(cid, "MISCONCEPTION_MCQ", snap)


def test_empty_answer_updates_memory_as_failure():
    db, cid, _k0, concept, claims = seed_graded()
    pid = mcq_probe(db, cid, concept, claims)
    db.add_memory(cid, L, half_life=2.0, streak=3, attempts=3, passes=3,
                  last_reviewed=datetime.now(timezone.utc) - timedelta(days=1))
    out = run(GradingService(db, settings()).grade(probe_id=pid, learner_id=L))
    assert out["grading_mode"] == "empty" and not out["passed"]
    m = db.memory[(cid, L)]
    assert m["streak"] == 0 and m["attempts"] == 4 and m["half_life"] < 2.0
    assert len(db.attempts) == 1


def test_probe_ownership_and_concept_checks():
    db, cid, _k0, concept, claims = seed_graded()
    pid = mcq_probe(db, cid, concept, claims)
    svc = GradingService(db, settings())
    with pytest.raises(GradingServiceError) as e1:
        run(svc.grade(probe_id=pid, learner_id="22222222-2222-2222-2222-222222222222"))
    assert e1.value.status_code == 404
    with pytest.raises(GradingServiceError) as e2:
        run(svc.grade(probe_id=pid, learner_id=L, concept_id="33333333-3333-3333-3333-333333333333"))
    assert e2.value.status_code == 422
    with pytest.raises(GradingServiceError) as e3:
        run(svc.grade(probe_id=pid, learner_id=L, concept_version=9))
    assert e3.value.status_code == 422


def test_mastery_and_solo_after_grading():
    db, cid, k0, concept, claims = seed_graded()
    svc = GradingService(db, settings(), embedding_service=FakeEmbedding())
    # 1) correct MCQ → Unistructural, not yet mastered (needs 2 distinct types)
    pid = mcq_probe(db, cid, concept, claims)
    out = run(svc.grade(probe_id=pid, learner_id=L, answer_payload={"selected_index": 0}))
    assert out["passed"] and out["solo_level"] == "Unistructural"
    assert out["mastery"]["n_req"] == 2 and not out["mastery"]["mastered"]
    assert db.concepts[cid]["n_req"] == 2
    assert out["next_review_at"]
    # 2) correct free-text RECALL covering the transition claim → mastered
    snap = build_snapshot(concept=concept, claims=claims, probe_type="RECALL")
    pid2 = db.add_probe(cid, "RECALL", snap)
    out2 = run(svc.grade(probe_id=pid2, learner_id=L,
                         answer_text="The server replies with a SYN-ACK packet."))
    assert out2["grading_mode"] == "claim_coverage" and out2["passed"]
    assert out2["mastery"]["mastered"] and out2["mastery"]["newly_mastered"]
    assert db.memory[(cid, L)]["mastered_at"] is not None
    # Relational needs all transitions matched on >= 2 distinct probe types.
    assert out2["solo_level"] == "Relational"
    stored = db.attempts[-1]["gap_report"]
    assert stored["grading"]["matched_claim_ids"] == [k0]
    # Mastered concepts leave the queue.
    q = run(MemoryService(db, settings=settings()).get_review_queue(L, 8))
    assert cid not in [i["concept_id"] for i in q]


def test_wrong_mcq_writes_misconception_event():
    db, cid, _k0, concept, claims = seed_graded()
    pid = mcq_probe(db, cid, concept, claims)
    out = run(GradingService(db, settings()).grade(
        probe_id=pid, learner_id=L, answer_payload={"selected_index": 2}))
    assert out["misconceptions"] == ["m2"]
    assert db.misconceptions[0]["tag"] == "m2"
    assert db.misconceptions[0]["attempt_id"] == out["attempt_id"]


# --- HTTP: /review/answer keeps the Express call shape ---------------------
def test_review_answer_route():
    from fastapi.testclient import TestClient
    import app.dependencies as deps
    import app.main as main

    db, cid, _k0, concept, claims = seed_graded()
    pid = mcq_probe(db, cid, concept, claims)

    async def fake_db():
        yield db

    main.app.dependency_overrides[deps.get_db] = fake_db
    deps.get_settings.cache_clear()
    try:
        import os
        os.environ["INTERNAL_API_KEY"] = "test-key"
        client = TestClient(main.app)
        r = client.post(f"/review/answer?learner_id={L}",
                        json={"probe_id": pid, "answer_payload": {"selected_index": 0}},
                        headers={"X-Internal-Key": "test-key"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["passed"] is True and body["band"] == "Full"
        assert body["next_review_at"] and body["memory"]["attempts"] == 1
        r404 = client.post("/review/answer?learner_id=22222222-2222-2222-2222-222222222222",
                           json={"probe_id": pid}, headers={"X-Internal-Key": "test-key"})
        assert r404.status_code == 404
    finally:
        main.app.dependency_overrides.clear()
        os.environ.pop("INTERNAL_API_KEY", None)
        deps.get_settings.cache_clear()
