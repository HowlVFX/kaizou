"""Perturbation delta scoring (§5.12).

A Process Template carries, per probe, an authored delta: if the probe's
stated condition were altered, which downstream claims *flip* (F) and which
stay *invariant* (I). The learner answers in two parts — what changes and
what stays. We extract F̂ (claims they said change) and Î (claims they said
stay), each matched to the authored claim set by the SAME embedding
claim-match used everywhere else (§5.2, reused from ``coverage``):

    flip_recall  = |F ∩ F̂| / |F|
    inv_recall   = |I ∩ Î| / |I|
    false_flip   = |F̂ ∩ I| / |I|      claimed to change, actually invariant
    false_inv    = |Î ∩ F| / |F|      claimed invariant, actually changes

    delta_score = clamp( 0.40·flip_recall + 0.30·inv_recall
                         − 0.15·false_flip − 0.15·false_inv , 0, 1 )

``false_inv`` is the diagnostically richest error: the learner does not know
which steps are load-bearing — a memorised narrative rather than a causal
model. §5.12 says to flag it by name, so the gap report names it (without
leaking claim text — same redacted-cue style as the coverage gap report).

Category gating (§4.3 / §5.12):
  - CONVENTIONAL   → F = ∅; the correct answer is "nothing changes". The
                     stored key already encodes this (empty ``flipped``).
  - PROBABILISTIC  → exact set matching is disabled; the grader returns None
                     so the dispatcher falls back to claim coverage.

🔒 No LLM is called here. Embeddings (claim matching) are the only model call,
mirroring ``grade_claim_coverage``.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Optional

from app.grading.answer_key import AnswerKey
from app.grading.composite import classify_understanding_band
from app.grading.coverage import build_similarity_matrix, match_claims
from app.grading.engine import (
    EmbedTexts,
    ClaimEmbeddings,
    GradeOutcome,
    _band,
    segment_into_sentences,
)
from app.grading.gap_report import claim_category, redacted_cue

# Categories for which exact flip/invariant set matching is disabled (§5.12).
_COVERAGE_FALLBACK_CATEGORIES = frozenset({"PROBABILISTIC"})


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def compute_delta_score(
    flipped: set[int],
    invariant: set[int],
    said_flip: set[int],
    said_inv: set[int],
) -> dict:
    """§5.12 delta formula over authored (F, I) and learner (F̂, Î) sets.

    Recall denominators are the authored set sizes; false-rate denominators
    follow the spec exactly (false_flip over |I|, false_inv over |F|). An
    empty authored set makes its recall vacuously 1.0 (nothing to recall) and
    the corresponding false rate 0.0 (nothing to be wrong about) — this is the
    CONVENTIONAL "nothing changes" case when F = ∅.
    """
    n_f = len(flipped)
    n_i = len(invariant)

    flip_recall = len(flipped & said_flip) / n_f if n_f else 1.0
    inv_recall = len(invariant & said_inv) / n_i if n_i else 1.0
    false_flip = len(said_flip & invariant) / n_i if n_i else 0.0
    false_inv = len(said_inv & flipped) / n_f if n_f else 0.0

    delta = clamp01(
        0.40 * flip_recall + 0.30 * inv_recall
        - 0.15 * false_flip - 0.15 * false_inv
    )
    return {
        "flip_recall": flip_recall,
        "inv_recall": inv_recall,
        "false_flip": false_flip,
        "false_inv": false_inv,
        "delta_score": delta,
    }


def _match_indices(
    claim_indices: list[int],
    claim_embeddings: list[Any],
    key: AnswerKey,
    learner_sentences: list[str],
    learner_embeddings: list[Any],
    threshold: float,
) -> set[int]:
    """Return the subset of ``claim_indices`` matched by the learner text.

    Reuses the §5.2 greedy-max claim match: a claim is "said" if any learner
    sentence matches it at or above τ. Alias short-circuit is honoured, same
    as the coverage path.
    """
    if not claim_indices or not learner_sentences:
        return set()
    req_emb = [claim_embeddings[i] for i in claim_indices]
    alias_table = {
        pos: key.claims[i].aliases
        for pos, i in enumerate(claim_indices) if key.claims[i].aliases
    }
    matrix = build_similarity_matrix(
        req_emb, learner_embeddings,
        alias_table=alias_table, learner_texts=learner_sentences,
    )
    matched, _supported, _pairs = match_claims(matrix, threshold=threshold)
    return {claim_indices[pos] for pos, is_m in enumerate(matched) if is_m}


def _split_answer(answer_text: str, answer_payload: Optional[dict]) -> tuple[list[str], list[str]]:
    """Split the learner's answer into (change-sentences, stay-sentences).

    Preferred: a structured two-part payload
    ``{"flipped"|"changes": str, "invariant"|"stays": str}``. Absent that,
    the whole free-text answer is used for BOTH parts — every sentence is a
    candidate for matching either set, which is the honest reading of an
    unsegmented answer (the learner's claim to "change" and "stay" are both
    drawn from the same prose).
    """
    if answer_payload:
        change_raw = (
            answer_payload.get("flipped")
            or answer_payload.get("changes")
            or answer_payload.get("changed")
            or ""
        )
        stay_raw = (
            answer_payload.get("invariant")
            or answer_payload.get("stays")
            or answer_payload.get("unchanged")
            or ""
        )
        if isinstance(change_raw, str) and isinstance(stay_raw, str) and (change_raw.strip() or stay_raw.strip()):
            return segment_into_sentences(change_raw), segment_into_sentences(stay_raw)

    whole = segment_into_sentences(answer_text)
    return whole, whole


async def grade_perturbation(
    key: AnswerKey,
    answer_text: str,
    answer_payload: Optional[dict],
    settings,
    *,
    embed_texts: EmbedTexts,
    claim_embeddings: ClaimEmbeddings,
    perturbation: Optional[dict] = None,
) -> Optional[GradeOutcome]:
    """Grade a perturbation answer against its expected delta (§5.12).

    Returns a GradeOutcome carrying ``delta_score`` (also used as the
    composite for band classification), ``passed`` against
    ``perturbation_pass_threshold``, and ``meta.matched_claim_ids`` for the
    correctly-classified claims so mastery's transition coverage still works.

    Returns None when the dispatcher should fall back to claim coverage:
      - PROBABILISTIC category (exact set matching disabled), or
      - no usable expected-delta structure.

    ``perturbation`` defaults to ``key.perturbation``; ANALOGY_SIMULATE passes
    its own mapped-relation delta here (§9.5) so the same math is reused.
    """
    delta_key = perturbation if perturbation is not None else key.perturbation
    if not delta_key:
        return None
    if (key.category or "").upper() in _COVERAGE_FALLBACK_CATEGORIES:
        return None

    flipped = set(delta_key.get("flipped") or [])
    invariant = set(delta_key.get("invariant") or [])
    n_claims = len(key.claims)
    flipped = {i for i in flipped if 0 <= i < n_claims}
    invariant = {i for i in invariant if 0 <= i < n_claims}
    if not flipped and not invariant:
        return None

    change_sentences, stay_sentences = _split_answer(answer_text, answer_payload)
    all_indices = sorted(flipped | invariant)

    change_emb = await embed_texts(change_sentences) if change_sentences else []
    # When both parts share the same prose, reuse the embeddings.
    if stay_sentences == change_sentences:
        stay_emb = change_emb
    else:
        stay_emb = await embed_texts(stay_sentences) if stay_sentences else []

    all_key_emb = await claim_embeddings(key)
    threshold = settings.semantic_match_threshold

    said_flip = _match_indices(
        all_indices, all_key_emb, key, change_sentences, change_emb, threshold,
    )
    said_inv = _match_indices(
        all_indices, all_key_emb, key, stay_sentences, stay_emb, threshold,
    )
    # A claim the learner names in BOTH parts is ambiguous; count it toward the
    # part with the stronger single-sentence support is overkill here — treat
    # it as flip (a "changes" assertion is the load-bearing signal §5.12).
    said_inv = said_inv - said_flip

    scores = compute_delta_score(flipped, invariant, said_flip, said_inv)
    delta = scores["delta_score"]

    passed = delta >= _pass_threshold(settings)
    band = _band(settings, delta, True)

    # Correctly classified claims — flipped correctly said-flip, invariant
    # correctly said-invariant. These are the "matched" claims mastery reads.
    correct_flip = flipped & said_flip
    correct_inv = invariant & said_inv
    correct = correct_flip | correct_inv
    transition_idx = [i for i in all_indices if key.claims[i].is_transition]
    transitions_matched = sum(1 for i in transition_idx if i in correct)
    matched_claim_ids = [
        key.claims[i].id for i in sorted(correct) if key.claims[i].id
    ]

    meta = {
        "mode": "perturbation_delta",
        "probe_type": key.probe_type,
        "total_required": len(all_indices),
        "total_matched": len(correct),
        "transitions_total": len(transition_idx),
        "transitions_matched": transitions_matched,
        "all_transitions_matched": bool(transition_idx) and transitions_matched == len(transition_idx),
        "matched_claim_ids": matched_claim_ids,
        "delta_score": delta,
        "flip_recall": scores["flip_recall"],
        "inv_recall": scores["inv_recall"],
        "false_flip": scores["false_flip"],
        "false_inv": scores["false_inv"],
    }

    gap = _perturbation_gap_report(
        key, flipped, invariant, said_flip, said_inv, scores, band,
    )

    return GradeOutcome(
        mode="perturbation_delta",
        composite=delta,
        band=band,
        passed=passed,
        delta_score=delta,
        gap_report=gap,
        meta=meta,
    )


def _pass_threshold(settings) -> float:
    """§5.24.1 gate: perturbation passes at its own 0.70 threshold."""
    return float(getattr(settings, "perturbation_pass_threshold", 0.70))


def _perturbation_gap_report(
    key: AnswerKey,
    flipped: set[int],
    invariant: set[int],
    said_flip: set[int],
    said_inv: set[int],
    scores: dict,
    band: str,
) -> dict:
    """Build a redacted gap report (§5.9 style — no claim text leaks).

    Missed authored claims become hints (redacted cue only). The false_inv
    error is flagged by name (§5.12) — claims the learner said stay invariant
    that actually flip — again with only a redacted cue, never the sentence.
    """
    missed_flip = sorted(flipped - said_flip)      # should have flipped, didn't
    missed_inv = sorted(invariant - said_inv)      # should have stayed, didn't say
    false_inv_claims = sorted(said_inv & flipped)  # said invariant, actually flips

    def _hint(i: int, error: str) -> dict:
        c = key.claims[i]
        return {
            "claim_index": i,
            "category": claim_category(c.is_transition, c.is_load_bearing),
            "hint": redacted_cue(c.text),
            "error": error,
            "is_transition": c.is_transition,
            "is_load_bearing": c.is_load_bearing,
            "prerequisite_concept_id": None,
            "prerequisite_concept_label": None,
        }

    missing_claims = (
        [_hint(i, "missed_flip") for i in missed_flip]
        + [_hint(i, "missed_invariant") for i in missed_inv]
    )
    total_required = len(flipped | invariant)
    total_matched = len((flipped & said_flip) | (invariant & said_inv))

    return {
        "missing_claims": missing_claims,
        "total_required": total_required,
        "total_matched": total_matched,
        "coverage": None,
        "band": band,
        "delta_score": scores["delta_score"],
        "flip_recall": scores["flip_recall"],
        "inv_recall": scores["inv_recall"],
        "false_flip": scores["false_flip"],
        "false_inv": scores["false_inv"],
        # §5.12: name the false-invariant error — the learner treated a
        # load-bearing step as incidental. Redacted cue only, never the claim.
        "false_invariant_errors": [
            {
                "claim_index": i,
                "category": claim_category(key.claims[i].is_transition, key.claims[i].is_load_bearing),
                "hint": redacted_cue(key.claims[i].text),
                "note": "you said this stays the same, but changing the condition flips it",
            }
            for i in false_inv_claims
        ],
    }
