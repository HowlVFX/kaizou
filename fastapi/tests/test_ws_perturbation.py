"""Perturbation delta scoring (§5.12): the delta formula, category gating,
the CONVENTIONAL "nothing changes" case, and that delta_score is set and
SOLO-relevant. No AI calls — embeddings are the deterministic FakeEmbedding
(identical text → cosine 1.0)."""
from __future__ import annotations

import asyncio

import pytest

from app.grading.answer_key import build_snapshot, parse_answer_key, sanitise_perturbation
from app.grading.engine import grade_answer
from app.grading.perturbation import clamp01, compute_delta_score, grade_perturbation
from test_ws2_support import FakeEmbedding, settings

# Four claims; claim 0 and 1 flip, claim 2 and 3 stay invariant.
CONCEPT = {"id": "c1", "version": 1, "canonical_label": "Rate limiter",
           "shape": "ORDERED_PROCESS", "category": "DETERMINISTIC_MECHANISM"}
CLAIMS = [
    {"id": "k0", "text": "The token bucket refills at a fixed rate.",
     "order_index": 0, "is_transition": True, "aliases": []},
    {"id": "k1", "text": "A request consumes one token from the bucket.",
     "order_index": 1, "is_transition": True, "aliases": []},
    {"id": "k2", "text": "The bucket has a maximum capacity ceiling.",
     "order_index": 2, "is_transition": False, "aliases": []},
    {"id": "k3", "text": "Rejected requests return a 429 status code.",
     "order_index": 3, "is_transition": False, "aliases": []},
]
DELTA = {"flipped": [0, 1], "invariant": [2, 3]}


def run(coro):
    return asyncio.run(coro)


def key_for(ptype, category="DETERMINISTIC_MECHANISM", perturbation=DELTA, **extra):
    concept = dict(CONCEPT, category=category)
    snap = build_snapshot(concept=concept, claims=CLAIMS, probe_type=ptype,
                          perturbation=perturbation, **extra)
    return parse_answer_key(snap, ptype)


def grade(key, text=None, payload=None, s=None, emb=None):
    s = s or settings()
    emb = emb or FakeEmbedding()

    async def claim_embeddings(k):
        return await emb.compute_batch_embeddings([c.text for c in k.claims])

    return run(grade_answer(
        key, answer_text=text, answer_payload=payload, settings=s,
        embed_texts=emb.compute_batch_embeddings, claim_embeddings=claim_embeddings,
    ))


# --- the delta formula (§5.12), pure, no embeddings ------------------------

def test_perfect_answer_scores_one():
    out = compute_delta_score({0, 1}, {2, 3}, said_flip={0, 1}, said_inv={2, 3})
    assert out["flip_recall"] == 1.0 and out["inv_recall"] == 1.0
    assert out["false_flip"] == 0.0 and out["false_inv"] == 0.0
    assert out["delta_score"] == pytest.approx(0.70)  # 0.40 + 0.30


def test_partial_recall_matches_formula():
    # got one of two flips, both invariants, no false claims
    out = compute_delta_score({0, 1}, {2, 3}, said_flip={0}, said_inv={2, 3})
    # 0.40*0.5 + 0.30*1.0 = 0.50
    assert out["delta_score"] == pytest.approx(0.50)


def test_false_invariant_is_penalised_and_reported():
    # said claim 0 (a flip) stays invariant → false_inv = 1/2
    out = compute_delta_score({0, 1}, {2, 3}, said_flip={1}, said_inv={0, 2, 3})
    # flip_recall 0.5, inv_recall 1.0, false_flip 0, false_inv 0.5
    # 0.40*0.5 + 0.30*1.0 - 0.15*0.5 = 0.20 + 0.30 - 0.075 = 0.425
    assert out["false_inv"] == pytest.approx(0.5)
    assert out["delta_score"] == pytest.approx(0.425)


def test_false_flip_penalised():
    # said an invariant (claim 2) flips → false_flip = 1/2
    out = compute_delta_score({0, 1}, {2, 3}, said_flip={0, 1, 2}, said_inv={3})
    # flip 1.0, inv 0.5, false_flip 0.5, false_inv 0
    # 0.40 + 0.15 - 0.075 = 0.475
    assert out["false_flip"] == pytest.approx(0.5)
    assert out["delta_score"] == pytest.approx(0.475)


def test_clamp_keeps_score_in_range():
    assert clamp01(-1.0) == 0.0 and clamp01(2.0) == 1.0
    out = compute_delta_score({0}, {1}, said_flip={1}, said_inv={0})  # all wrong
    assert 0.0 <= out["delta_score"] <= 1.0


# --- end-to-end via grade_answer (embedding-matched) -----------------------

def _sentences(*indices):
    return " ".join(CLAIMS[i]["text"] for i in indices)


def test_two_part_payload_perfect_answer_passes_and_sets_delta():
    key = key_for("PERTURBATION")
    out = grade(key, payload={"flipped": _sentences(0, 1), "invariant": _sentences(2, 3)})
    assert out.mode == "perturbation_delta"
    assert out.delta_score == pytest.approx(0.70)
    assert out.composite == out.delta_score        # delta drives band
    # matched claim ids populated for mastery transition-coverage
    assert set(out.meta["matched_claim_ids"]) == {"k0", "k1", "k2", "k3"}
    assert out.meta["all_transitions_matched"] is True


def test_delta_score_gates_solo_at_threshold():
    key = key_for("PERTURBATION")
    # perfect answer is 0.70 == default perturbation_pass_threshold
    out = grade(key, payload={"flipped": _sentences(0, 1), "invariant": _sentences(2, 3)})
    assert out.passed is True and out.delta_score >= 0.70
    # a weaker answer (one flip missed) is below 0.70 and does not pass
    weak = grade(key, payload={"flipped": _sentences(0), "invariant": _sentences(2, 3)})
    assert weak.delta_score < 0.70 and weak.passed is False


def test_false_invariant_flagged_by_name_without_leaking_text():
    key = key_for("PERTURBATION")
    # learner puts a real flip (claim 0) into the "stays the same" bucket
    out = grade(key, payload={"flipped": _sentences(1), "invariant": _sentences(0, 2, 3)})
    errors = out.gap_report["false_invariant_errors"]
    assert any(e["claim_index"] == 0 for e in errors)
    blob = str(out.gap_report)
    for c in CLAIMS:
        assert c["text"] not in blob        # no claim text leaks


def test_whole_text_answer_without_payload_is_graded():
    key = key_for("PERTURBATION")
    out = grade(key, text=_sentences(0, 1, 2, 3))
    assert out.mode == "perturbation_delta"
    # every claim is named; flips recalled, invariants recalled too → high
    assert out.delta_score > 0.0


# --- category gating (§5.12) -----------------------------------------------

def test_conventional_nothing_changes_is_correct():
    # CONVENTIONAL: F = ∅. Correct answer recognises nothing changes.
    key = key_for("PERTURBATION", category="CONVENTIONAL",
                  perturbation={"flipped": [], "invariant": [0, 1, 2, 3]})
    out = grade(key, payload={"flipped": "", "invariant": _sentences(0, 1, 2, 3)})
    assert out.mode == "perturbation_delta"
    # empty flip set → flip_recall vacuously 1.0; all invariants recalled
    assert out.meta["flip_recall"] == 1.0
    assert out.delta_score == pytest.approx(0.70)
    assert out.passed is True


def test_probabilistic_falls_back_to_coverage():
    key = key_for("PERTURBATION", category="PROBABILISTIC")
    # grader returns None → dispatcher uses claim coverage
    outcome = run(grade_perturbation(
        key, _sentences(0, 1), None, settings(),
        embed_texts=FakeEmbedding().compute_batch_embeddings,
        claim_embeddings=lambda k: _noop(k),
    ))
    assert outcome is None
    # and through grade_answer it lands on the coverage path
    out = grade(key, text=_sentences(0, 1))
    assert out.mode == "claim_coverage"


async def _noop(k):
    return []


def test_missing_delta_falls_back_to_coverage():
    # a PERTURBATION probe with no expected delta → coverage path
    concept = dict(CONCEPT)
    snap = build_snapshot(concept=concept, claims=CLAIMS, probe_type="PERTURBATION")
    key = parse_answer_key(snap, "PERTURBATION")
    assert key.perturbation is None
    out = grade(key, text=_sentences(0))
    assert out.mode == "claim_coverage"


# --- snapshot sanitisation --------------------------------------------------

def test_sanitise_rejects_overlap_and_out_of_range():
    assert sanitise_perturbation({"flipped": [0, 1], "invariant": [1, 2]}, 4) is None  # overlap
    ok = sanitise_perturbation({"flipped": [0, 9], "invariant": [1, 2]}, 4)            # 9 dropped
    assert ok == {"flipped": [0], "invariant": [1, 2]}
    assert sanitise_perturbation({"flipped": [], "invariant": []}, 4) is None          # empty
    # bool is not accepted as an index (True == 1)
    assert sanitise_perturbation({"flipped": [True], "invariant": [2]}, 4) == {"flipped": [], "invariant": [2]}


def test_conventional_empty_flip_snapshot_survives_roundtrip():
    key = key_for("PERTURBATION", category="CONVENTIONAL",
                  perturbation={"flipped": [], "invariant": [0, 1, 2, 3]})
    assert key.perturbation == {"flipped": [], "invariant": [0, 1, 2, 3]}
    assert key.category == "CONVENTIONAL"
