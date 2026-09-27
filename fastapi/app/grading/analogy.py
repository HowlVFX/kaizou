"""Analogy grading — the tractable subset of §9.5.

Full §9.4 structural alignment (correspondence role/relation extraction) is
OUT OF SCOPE by design: §13 (P13) marks analogy the secondary, least-
deterministic feature, so we do NOT build correspondence extraction. What we
grade here maps directly onto the deterministic paths that already exist:

    ANALOGY_SIMULATE  → delta scoring (§5.12) over the analogy's mapped
                        relations. Reuses ``grade_perturbation`` with the
                        probe's own ``expected_delta`` (generated for
                        analogy-simulate probes the same way perturbation
                        probes get theirs).
    ANALOGY_BREAKDOWN → claim coverage of the learner's answer against the
                        authored ``known_divergences`` (where the analogy
                        stops holding). Graded as coverage over a claim set
                        synthesised from the divergence statements.
    ANALOGY_FORWARD   → claim coverage over the correspondence relations.
                        Kept as the existing coverage path for now (§9.5);
                        the dispatcher handles it, this module documents it.

🔒 No LLM is called here.
"""

from __future__ import annotations

from typing import Any, Optional

from app.grading.answer_key import AnswerKey, KeyClaim
from app.grading.engine import (
    ClaimEmbeddings,
    EmbedTexts,
    GradeOutcome,
    GradingInputError,
    grade_claim_coverage,
)
from app.grading.perturbation import grade_perturbation


async def grade_analogy_simulate(
    key: AnswerKey,
    answer_text: str,
    answer_payload: Optional[dict],
    settings,
    *,
    embed_texts: EmbedTexts,
    claim_embeddings: ClaimEmbeddings,
) -> Optional[GradeOutcome]:
    """ANALOGY_SIMULATE — delta scoring over mapped relations (§9.5).

    The mapped-relation delta lives in ``key.perturbation`` (generated for
    analogy-simulate probes exactly like a PERTURBATION probe's delta). Reuses
    the §5.12 grader. Returns None to fall back to coverage when there is no
    usable delta (or the category disables set matching).
    """
    outcome = await grade_perturbation(
        key, answer_text, answer_payload, settings,
        embed_texts=embed_texts, claim_embeddings=claim_embeddings,
    )
    if outcome is not None:
        outcome.mode = "analogy_simulate_delta"
        outcome.meta["mode"] = "analogy_simulate_delta"
    return outcome


async def grade_analogy_breakdown(
    key: AnswerKey,
    answer_text: str,
    settings,
    *,
    embed_texts: EmbedTexts,
    claim_embeddings: ClaimEmbeddings,
    get_nli=None,
) -> Optional[GradeOutcome]:
    """ANALOGY_BREAKDOWN — coverage against authored known-divergences (§9.5).

    The learner is asked where the analogy stops holding. We grade by claim
    coverage of their answer against the authored ``divergences`` list. The
    divergence statements become the required claim set; the concept's own
    claims are not the target here (the learner is not restating the concept,
    they are naming its limits).

    Returns None to fall back to normal coverage when the probe carries no
    authored divergences.
    """
    divergences = key.divergences or []
    if not divergences:
        return None

    # Grade against a divergence-claim key: each authored divergence is a
    # required, unweighted supporting claim. Reuse the coverage path unchanged
    # so ordering/verbatim/precision behave identically to other free-text
    # grading — only the required set is swapped.
    divergence_key = AnswerKey(
        probe_type=key.probe_type,
        claims=[KeyClaim(text=d) for d in divergences],
        shape="DEFINITION",           # unordered — divergences have no sequence
        concept_label=key.concept_label,
        version=key.version,
        category=key.category,
    )
    outcome = await grade_claim_coverage(
        divergence_key, answer_text, settings,
        embed_texts=embed_texts, claim_embeddings=claim_embeddings,
        get_nli=get_nli,
    )
    outcome.mode = "analogy_breakdown_coverage"
    outcome.meta["mode"] = "analogy_breakdown_coverage"
    outcome.meta["probe_type"] = key.probe_type
    return outcome
