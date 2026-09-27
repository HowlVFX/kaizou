"""Analogy grading (§9.5): ANALOGY_SIMULATE via the perturbation delta path,
ANALOGY_BREAKDOWN via coverage against authored known-divergences, and
ANALOGY_FORWARD kept on the coverage path. No AI calls."""
from __future__ import annotations

import asyncio

import pytest

from app.grading.answer_key import build_snapshot, parse_answer_key
from app.grading.engine import grade_answer
from test_ws2_support import FakeEmbedding, settings

CONCEPT = {"id": "a1", "version": 1, "canonical_label": "Electron orbitals",
           "shape": "CAUSAL_RELATION", "category": "DETERMINISTIC_MECHANISM"}
# Mapped-relation claims for the analogy (the "planets orbit the sun" model).
CLAIMS = [
    {"id": "k0", "text": "Electrons occupy discrete energy levels.",
     "order_index": 0, "is_transition": True, "aliases": []},
    {"id": "k1", "text": "Absorbing a photon promotes an electron upward.",
     "order_index": 1, "is_transition": True, "aliases": []},
    {"id": "k2", "text": "The nucleus sits at the centre of the atom.",
     "order_index": 2, "is_transition": False, "aliases": []},
]
DELTA = {"flipped": [0, 1], "invariant": [2]}
DIVERGENCES = [
    "Planets follow continuous orbits while electrons occupy quantised levels.",
    "Gravity is always attractive but electromagnetic force can repel.",
]


def run(coro):
    return asyncio.run(coro)


def grade(key, text=None, payload=None, s=None, emb=None):
    s = s or settings()
    emb = emb or FakeEmbedding()

    async def claim_embeddings(k):
        return await emb.compute_batch_embeddings([c.text for c in k.claims])

    return run(grade_answer(
        key, answer_text=text, answer_payload=payload, settings=s,
        embed_texts=emb.compute_batch_embeddings, claim_embeddings=claim_embeddings,
    ))


def _sentences(*indices):
    return " ".join(CLAIMS[i]["text"] for i in indices)


# --- ANALOGY_SIMULATE → delta path (§9.5) ----------------------------------

def test_analogy_simulate_uses_delta_path():
    snap = build_snapshot(concept=CONCEPT, claims=CLAIMS,
                          probe_type="ANALOGY_SIMULATE", perturbation=DELTA)
    key = parse_answer_key(snap, "ANALOGY_SIMULATE")
    out = grade(key, payload={"flipped": _sentences(0, 1), "invariant": _sentences(2)})
    assert out.mode == "analogy_simulate_delta"
    assert out.delta_score == pytest.approx(0.70)
    assert out.composite == out.delta_score
    assert set(out.meta["matched_claim_ids"]) == {"k0", "k1", "k2"}


def test_analogy_simulate_without_delta_falls_back_to_coverage():
    snap = build_snapshot(concept=CONCEPT, claims=CLAIMS, probe_type="ANALOGY_SIMULATE")
    key = parse_answer_key(snap, "ANALOGY_SIMULATE")
    assert key.perturbation is None
    out = grade(key, text=_sentences(0))
    assert out.mode == "claim_coverage"


# --- ANALOGY_BREAKDOWN → coverage vs known_divergences (§9.5) ---------------

def test_analogy_breakdown_grades_against_divergences():
    snap = build_snapshot(concept=CONCEPT, claims=CLAIMS,
                          probe_type="ANALOGY_BREAKDOWN", divergences=DIVERGENCES)
    key = parse_answer_key(snap, "ANALOGY_BREAKDOWN")
    assert key.divergences == DIVERGENCES
    # naming both divergences → full coverage of the divergence set
    out = grade(key, text=" ".join(DIVERGENCES))
    assert out.mode == "analogy_breakdown_coverage"
    assert out.coverage == pytest.approx(1.0)
    assert out.meta["total_required"] == 2


def test_analogy_breakdown_partial_coverage():
    snap = build_snapshot(concept=CONCEPT, claims=CLAIMS,
                          probe_type="ANALOGY_BREAKDOWN", divergences=DIVERGENCES)
    key = parse_answer_key(snap, "ANALOGY_BREAKDOWN")
    out = grade(key, text=DIVERGENCES[0])       # only one divergence named
    assert out.mode == "analogy_breakdown_coverage"
    assert 0.0 < out.coverage < 1.0
    # the missed divergence is reported without leaking the full statement
    blob = str(out.gap_report)
    assert DIVERGENCES[1] not in blob


def test_analogy_breakdown_without_divergences_falls_back_to_coverage():
    snap = build_snapshot(concept=CONCEPT, claims=CLAIMS, probe_type="ANALOGY_BREAKDOWN")
    key = parse_answer_key(snap, "ANALOGY_BREAKDOWN")
    assert key.divergences is None
    out = grade(key, text=_sentences(0))
    assert out.mode == "claim_coverage"          # concept-claim coverage fallback


# --- ANALOGY_FORWARD stays on the coverage path (§9.5) ---------------------

def test_analogy_forward_is_coverage_path():
    snap = build_snapshot(concept=CONCEPT, claims=CLAIMS, probe_type="ANALOGY_FORWARD")
    key = parse_answer_key(snap, "ANALOGY_FORWARD")
    out = grade(key, text=_sentences(0, 1))
    assert out.mode == "claim_coverage"
    assert out.meta["total_matched"] == 2
