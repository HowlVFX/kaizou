"""Grading dispatch (§6.8) — deterministic, per probe type.

    CLOZE              normalised exact / alias match on the blanked term;
                       longer non-matching answers fall back to claim coverage
                       against the target claim
    RECALL, *_TRANSFER claim-coverage path, unordered weights       (§5.8.2)
    PROCESS_TRACE      claim-coverage path, ordered weights if the shape is
                       ordered, + branch leakage L                  (§5.8.1, §5.7)
    MISCONCEPTION_MCQ  exact match + misconception tag, payload only (§5.14)
    CONCEPT_SORT       ARI vs G_m and G_s + principle_ratio, payload only (§5.13)
    PERTURBATION       delta scoring against the expected delta       (§5.12);
                       falls back to coverage without a delta / for PROBABILISTIC
    ANALOGY_SIMULATE   delta scoring over mapped relations             (§9.5)
    ANALOGY_BREAKDOWN  coverage against authored known-divergences     (§9.5)
    others             claim-coverage path. PROCEDURAL execution grading
                       (§5.8.4) is intentionally deferred — it needs sandbox /
                       symbolic-evaluation infra — and degrades to claim
                       coverage + ordering. Full §9.4 analogy structural
                       alignment is out of scope (§13 P13); ANALOGY_FORWARD
                       stays on the coverage path.

Empty answers are graded as a failed recall (score 0, Not_Yet_Engaged) so
memory still updates.

🔒 No LLM is ever called here. Embeddings (claim matching) and NLI
(contradiction evidence) are the only model calls, and payload-only and
exact-match cloze answers use neither.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from app.grading.answer_key import AnswerKey, normalise_answer
from app.grading.composite import (
    calculate_branch_leakage,
    calculate_composite_score,
    classify_understanding_band,
)
from app.grading.concept_sort import (
    adjusted_rand_index,
    learner_groups_from_payload,
    partition_labels,
    principle_ratio,
    selected_option_from_answer,
)
from app.grading.coverage import (
    build_similarity_matrix,
    calculate_claim_weight,
    calculate_coverage,
    match_claims,
)
from app.grading.gap_report import GapReportBuilder, claim_category, redacted_cue
from app.grading.ordering import calculate_kendall_tau_b, calculate_ordering_score
from app.grading.precision import calculate_precision
from app.grading.verbatim import calculate_verbatim_penalty, calculate_verbatim_ratio

logger = logging.getLogger(__name__)

ORDERED_SHAPES = frozenset({"ORDERED_PROCESS", "PROCEDURAL"})


class GradingInputError(ValueError):
    """The submitted answer is malformed for this probe type (→ HTTP 422)."""


@dataclass
class GradeOutcome:
    mode: str
    composite: float
    band: str
    passed: bool
    coverage: Optional[float] = None
    ordering: Optional[float] = None
    precision: Optional[float] = None
    verbatim: Optional[float] = None
    branch_leakage: Optional[float] = None
    delta_score: Optional[float] = None
    ari_mechanism: Optional[float] = None
    ari_surface: Optional[float] = None
    principle_ratio: Optional[float] = None
    gap_report: dict = field(default_factory=dict)
    # Server-side grading facts (stored under attempts.gap_report.grading,
    # read by SOLO/mastery). Claim ids only — never claim text.
    meta: dict = field(default_factory=dict)
    misconception_tags: list[str] = field(default_factory=list)
    contradiction: dict = field(default_factory=lambda: {"checked": False, "reason": "not_applicable"})


EmbedTexts = Callable[[list[str]], Awaitable[list[Any]]]
ClaimEmbeddings = Callable[[AnswerKey], Awaitable[list[Any]]]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def segment_into_sentences(text: str) -> list[str]:
    """Split free text into sentence-level learner claims.

    Fragments of <= 10 chars are dropped as noise, but a short answer that
    produces no segments is kept whole so it is still graded.
    """
    stripped = (text or "").strip()
    if not stripped:
        return []
    raw = re.split(r"(?<=[.!?])\s+", stripped)
    segments = [s.strip() for s in raw if len(s.strip()) > 10]
    return segments or [stripped]


def _weights(key: AnswerKey, indices: list[int]) -> list[float]:
    return [
        calculate_claim_weight(
            key.claims[i].is_transition, key.claims[i].is_load_bearing, key.claims[i].weight,
        )
        for i in indices
    ]


def _band(settings, score: float, all_transitions: bool) -> str:
    return classify_understanding_band(
        score, all_transitions,
        band_full=settings.band_full,
        band_shallow=settings.band_shallow,
        band_incomplete=settings.band_incomplete,
    )


def _meta(key: AnswerKey, indices: list[int], matched: list[bool], mode: str) -> dict:
    transition_idx = [k for k, i in enumerate(indices) if key.claims[i].is_transition]
    t_matched = sum(1 for k in transition_idx if matched[k])
    return {
        "mode": mode,
        "probe_type": key.probe_type,
        "total_required": len(indices),
        "total_matched": sum(1 for m in matched if m),
        "transitions_total": len(transition_idx),
        "transitions_matched": t_matched,
        # Strict (non-vacuous) — a key with no transitions can never unlock
        # Relational via this path (§5.24.1).
        "all_transitions_matched": bool(transition_idx) and t_matched == len(transition_idx),
        "matched_claim_ids": [
            key.claims[i].id for k, i in enumerate(indices) if matched[k] and key.claims[i].id
        ],
    }


def _hint_items(key: AnswerKey, indices: list[int], matched: list[bool]) -> list[dict]:
    items = []
    for k, i in enumerate(indices):
        if matched[k]:
            continue
        c = key.claims[i]
        items.append({
            "claim_index": i,
            "category": claim_category(c.is_transition, c.is_load_bearing),
            "hint": redacted_cue(c.text),
            "weight": calculate_claim_weight(c.is_transition, c.is_load_bearing, c.weight),
            "is_transition": c.is_transition,
            "is_load_bearing": c.is_load_bearing,
            "prerequisite_concept_id": None,
            "prerequisite_concept_label": None,
        })
    items.sort(key=lambda d: d["weight"], reverse=True)
    return items


def _claim_branch(key: AnswerKey, i: int) -> Optional[str]:
    """Branch of claim i: claims.branch_id first, else the template's branches."""
    if key.claims[i].branch_id:
        return key.claims[i].branch_id
    branches = (key.template or {}).get("branches") or {}
    for name, members in branches.items():
        if i in (members or []):
            return name
    return None


def _canonical_position(key: AnswerKey, i: int) -> Optional[int]:
    if key.claims[i].order_index is not None:
        return key.claims[i].order_index
    trunk = (key.template or {}).get("trunk") or []
    return trunk.index(i) if i in trunk else None


# ---------------------------------------------------------------------------
# Per-type graders
# ---------------------------------------------------------------------------

def grade_empty(key: AnswerKey, settings) -> GradeOutcome:
    """Empty answer → failed recall (§5.4 edge case). Memory still updates."""
    indices = list(range(len(key.claims)))
    matched = [False] * len(indices)
    return GradeOutcome(
        mode="empty", composite=0.0, band="Not_Yet_Engaged", passed=False,
        coverage=0.0, precision=0.0, verbatim=0.0, branch_leakage=0.0,
        gap_report={
            "missing_claims": _hint_items(key, indices, matched),
            "total_required": len(indices), "total_matched": 0,
            "coverage": 0.0, "band": "Not_Yet_Engaged", "empty_answer": True,
        },
        meta=_meta(key, indices, matched, "empty"),
    )


def grade_mcq(key: AnswerKey, answer_payload, answer_text, settings) -> GradeOutcome:
    """§5.14 exact match; the chosen distractor's tag is the diagnostic."""
    mcq = key.mcq or {}
    distractor_map = {str(k): v for k, v in (mcq.get("distractor_map") or {}).items()}
    n_options = int(mcq.get("n_options") or (len(distractor_map) + 1))
    correct_index = mcq.get("correct_index")
    if not isinstance(correct_index, int):
        raise GradingInputError("probe has no MCQ answer key")

    selected = selected_option_from_answer(answer_payload, answer_text, n_options)
    if selected is None:
        has_input = bool(answer_payload) or bool((answer_text or "").strip())
        if has_input:
            raise GradingInputError(
                f"answer_payload.selected_index must be an option index 0..{n_options - 1}"
            )
        return grade_empty(key, settings)

    correct = selected == correct_index
    score = 1.0 if correct else 0.0
    tags: list[str] = []
    if not correct:
        tags.append(distractor_map.get(str(selected)) or "unmapped_distractor")

    target = key.target_claim_index
    indices = [target] if target is not None else []
    matched = [correct] if indices else []
    meta = _meta(key, indices, matched, "mcq")
    meta["total_matched"] = 1 if correct else 0
    meta["selected_index"] = selected
    return GradeOutcome(
        mode="mcq", composite=score, band=_band(settings, score, True),
        passed=score >= settings.pass_threshold,
        coverage=score, precision=score,
        gap_report={
            "missing_claims": [], "total_required": 1, "total_matched": meta["total_matched"],
            "coverage": score, "band": _band(settings, score, True),
            "correct": correct,
            # The misconception tag is a closed-vocabulary diagnostic, not the key.
            "misconception_tag": tags[0] if tags else None,
        },
        meta=meta,
        misconception_tags=tags,
    )


def grade_concept_sort(key: AnswerKey, answer_payload, settings) -> GradeOutcome:
    """§5.13 ARI against mechanism and surface partitions."""
    sort = key.sort or {}
    n_items = int(sort.get("n_items") or 0)
    g_m = partition_labels(sort.get("mechanism_groups") or [], n_items)
    g_s = partition_labels(sort.get("surface_groups") or [], n_items)
    if not n_items or g_m is None or g_s is None:
        raise GradingInputError("probe has no valid concept-sort answer key")

    if not answer_payload:
        return grade_empty(key, settings)
    groups = learner_groups_from_payload(answer_payload, n_items)
    labels_x = partition_labels(groups, n_items) if groups is not None else None
    if labels_x is None:
        raise GradingInputError(
            f"answer_payload.groups must partition item indices 0..{n_items - 1} "
            "(each exactly once)"
        )

    ari_m = adjusted_rand_index(labels_x, g_m)
    ari_s = adjusted_rand_index(labels_x, g_s)
    ratio = principle_ratio(ari_m, ari_s)
    score = max(0.0, min(1.0, ari_m))
    band = _band(settings, score, True)
    if ratio is None:
        sorted_by = "no_signal"
    else:
        sorted_by = "mechanism" if ratio > 0.5 else ("surface" if ratio < 0.5 else "mixed")
    return GradeOutcome(
        mode="concept_sort", composite=score, band=band,
        passed=score >= settings.pass_threshold,
        ari_mechanism=ari_m, ari_surface=ari_s, principle_ratio=ratio,
        gap_report={
            "missing_claims": [], "total_required": 0, "total_matched": 0,
            "coverage": None, "band": band,
            "ari_mechanism": ari_m, "ari_surface": ari_s,
            "principle_ratio": ratio, "sorted_by": sorted_by,
        },
        meta={"mode": "concept_sort", "probe_type": key.probe_type,
              "total_required": 0, "total_matched": 0,
              "transitions_total": 0, "transitions_matched": 0,
              "all_transitions_matched": False, "matched_claim_ids": []},
    )


def cloze_expected_terms(key: AnswerKey) -> list[str]:
    terms: list[str] = []
    if key.cloze:
        if key.cloze.get("answer"):
            terms.append(key.cloze["answer"])
        terms.extend(a for a in (key.cloze.get("aliases") or []) if a)
    if key.target_claim_index is not None:
        terms.extend(key.claims[key.target_claim_index].aliases)
    if not terms:
        # Legacy snapshot without a stored blank: any claim alias is accepted.
        for c in key.claims:
            terms.extend(c.aliases)
    return [t for t in terms if normalise_answer(t)]


def grade_cloze_exact(key: AnswerKey, answer_text: str, settings) -> Optional[GradeOutcome]:
    """Normalised exact / alias match. None → caller falls back to coverage."""
    given = normalise_answer(answer_text)
    expected = {normalise_answer(t) for t in cloze_expected_terms(key)}
    target = key.target_claim_index
    indices = [target] if target is not None else []

    if given and given in expected:
        matched = [True] * len(indices)
        meta = _meta(key, indices, matched, "cloze_exact")
        meta["total_matched"] = 1
        band = _band(settings, 1.0, True)
        return GradeOutcome(
            mode="cloze_exact", composite=1.0, band=band, passed=True,
            coverage=1.0, precision=1.0, verbatim=0.0, branch_leakage=0.0,
            gap_report={"missing_claims": [], "total_required": 1, "total_matched": 1,
                        "coverage": 1.0, "band": band, "correct": True},
            meta=meta,
        )

    if len((answer_text or "").strip()) <= settings.cloze_short_answer_max_chars:
        matched = [False] * len(indices)
        band = _band(settings, 0.0, False)
        return GradeOutcome(
            mode="cloze_exact", composite=0.0, band=band,
            passed=0.0 >= settings.pass_threshold,
            coverage=0.0, precision=0.0, verbatim=0.0, branch_leakage=0.0,
            gap_report={"missing_claims": [], "total_required": 1, "total_matched": 0,
                        "coverage": 0.0, "band": band, "correct": False},
            meta=_meta(key, indices, matched, "cloze_exact"),
        )
    return None


async def run_contradiction(
    source_claims: list[str],
    learner_claims: list[str],
    get_nli: Optional[Callable[[], Any]],
    threshold: float,
) -> dict:
    """§5.10 via local NLI. Disabled/unavailable is reported explicitly (§P12)."""
    if get_nli is None:
        return {"checked": False, "nli_disabled": True,
                "note": "NLI unavailable — no contradiction check ran"}
    from app.grading.contradiction import ContradictionDetector
    try:
        from app.nli.service import NLIUnavailable
    except Exception:  # pragma: no cover - nli package always present
        NLIUnavailable = RuntimeError  # type: ignore[misc,assignment]

    nli = get_nli()
    if nli is None or not getattr(nli, "enabled", False):
        return {"checked": False, "nli_disabled": True,
                "note": "NLI unavailable — no contradiction check ran"}
    try:
        report = await ContradictionDetector(nli, threshold=threshold).detect(
            source_claims=source_claims, learner_claims=learner_claims,
        )
    except NLIUnavailable:
        return {"checked": False, "nli_disabled": True,
                "note": "NLI unavailable — no contradiction check ran"}
    d = report.to_dict()
    # 🔒 §5.10: the conflicting pair is shown side by side by design.
    return {"checked": True, "nli_disabled": False, **d}


async def grade_claim_coverage(
    key: AnswerKey,
    answer_text: str,
    settings,
    *,
    embed_texts: EmbedTexts,
    claim_embeddings: ClaimEmbeddings,
    get_nli: Optional[Callable[[], Any]] = None,
    indices: Optional[list[int]] = None,
) -> GradeOutcome:
    """§5.2–5.9 claim-coverage path (+ ordering, verbatim, branch leakage)."""
    if indices is None:
        indices = list(range(len(key.claims)))
    learner_sentences = segment_into_sentences(answer_text)
    if not learner_sentences or not indices:
        return grade_empty(key, settings)

    all_key_embeddings = await claim_embeddings(key)
    key_embeddings = [all_key_embeddings[i] for i in indices]
    learner_embeddings = await embed_texts(learner_sentences)

    alias_table = {
        k: key.claims[i].aliases for k, i in enumerate(indices) if key.claims[i].aliases
    }
    sim_matrix = build_similarity_matrix(
        key_embeddings, learner_embeddings,
        alias_table=alias_table, learner_texts=learner_sentences,
    )
    matched, supported, pairs = match_claims(sim_matrix, threshold=settings.semantic_match_threshold)

    weights = _weights(key, indices)
    coverage = calculate_coverage(matched, weights)
    precision = calculate_precision(supported, len(learner_sentences))

    ordering_score = None
    if key.shape in ORDERED_SHAPES:
        canonical, offsets = [], []
        for k, j, _sim in pairs:
            pos = _canonical_position(key, indices[k])
            if pos is not None:
                canonical.append(pos)
                offsets.append(j)
        ordering_score = calculate_ordering_score(calculate_kendall_tau_b(canonical, offsets))

    key_texts = [key.claims[i].text for i in indices]
    v_ratio = calculate_verbatim_ratio(
        answer_text.lower().split(), " ".join(key_texts).lower().split(),
    )
    verbatim = calculate_verbatim_penalty(v_ratio, settings.verbatim_dead_zone)

    branch_leakage = 0.0
    if key.target_branch:
        non_target_matched, non_target_w, target_w = [], [], []
        for k, i in enumerate(indices):
            branch = _claim_branch(key, i)
            if branch == key.target_branch:
                target_w.append(weights[k])
            elif branch is not None:
                non_target_matched.append(matched[k])
                non_target_w.append(weights[k])
        if target_w:
            branch_leakage = calculate_branch_leakage(non_target_matched, non_target_w, target_w)

    composite = calculate_composite_score(
        coverage, precision, ordering_score, verbatim, branch_leakage,
        gamma=settings.gamma_verbatim, beta=settings.beta_leakage,
        w_coverage=settings.w_coverage, w_ordering=settings.w_ordering,
        w_precision=settings.w_precision,
    )
    all_transitions = all(
        matched[k] for k, i in enumerate(indices) if key.claims[i].is_transition
    )
    band = _band(settings, composite, all_transitions)

    report = GapReportBuilder().build(
        matched_claims=matched,
        answer_key_claims=key_texts,
        weights=weights,
        is_transition=[key.claims[i].is_transition for i in indices],
        is_load_bearing=[key.claims[i].is_load_bearing for i in indices],
        coverage=coverage,
        band=band,
    )
    gap = report.to_dict()
    # Report positions in the full answer key, not the graded subset.
    for item in gap["missing_claims"]:
        item["claim_index"] = indices[item["claim_index"]]

    tags: list[str] = []
    if branch_leakage > 0.0:
        tags.append("branch_leakage")

    contradiction = await run_contradiction(
        key_texts, learner_sentences, get_nli, settings.nli_contradiction_threshold,
    )
    if contradiction.get("checked"):
        for pair in contradiction.get("flagged_pairs", []):
            claim = key.claims[indices[pair["source_index"]]]
            tags.append(f"contradiction:{claim.id or indices[pair['source_index']]}")
    gap["contradiction_count"] = contradiction.get("contradiction_count") if contradiction.get("checked") else None

    return GradeOutcome(
        mode="claim_coverage", composite=composite, band=band,
        passed=composite >= settings.pass_threshold,
        coverage=coverage, ordering=ordering_score, precision=precision,
        verbatim=verbatim, branch_leakage=branch_leakage,
        gap_report=gap,
        meta=_meta(key, indices, matched, "claim_coverage"),
        misconception_tags=tags,
        contradiction=contradiction,
    )


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

async def grade_answer(
    key: AnswerKey,
    *,
    answer_text: Optional[str],
    answer_payload: Optional[dict],
    settings,
    embed_texts: EmbedTexts,
    claim_embeddings: ClaimEmbeddings,
    get_nli: Optional[Callable[[], Any]] = None,
) -> GradeOutcome:
    """Route an answer to the grader for its probe type (§6.8)."""
    probe_type = key.probe_type
    text = answer_text or ""

    if probe_type == "MISCONCEPTION_MCQ" and key.mcq:
        return grade_mcq(key, answer_payload, answer_text, settings)
    if probe_type == "CONCEPT_SORT" and key.sort:
        return grade_concept_sort(key, answer_payload, settings)

    if not key.claims:
        raise GradingInputError("probe answer key has no claims")

    # A perturbation / analogy-simulate answer can arrive as a two-part payload
    # (what changes / what stays) with no free text, so the empty guard is
    # "no text AND no payload" for those types.
    has_payload = bool(answer_payload)
    is_empty = not text.strip() and not has_payload

    # Lazy imports: the perturbation/analogy graders import shared helpers from
    # this module, so importing them at module load would be circular. By the
    # time dispatch runs, engine is fully initialised.
    if probe_type == "PERTURBATION":
        if is_empty:
            return grade_empty(key, settings)
        from app.grading.perturbation import grade_perturbation
        outcome = await grade_perturbation(
            key, text, answer_payload, settings,
            embed_texts=embed_texts, claim_embeddings=claim_embeddings,
        )
        if outcome is not None:
            return outcome
        # No usable expected delta (or PROBABILISTIC) → claim coverage (§5.12).
        if not text.strip():
            return grade_empty(key, settings)

    elif probe_type == "ANALOGY_SIMULATE":
        if is_empty:
            return grade_empty(key, settings)
        from app.grading.analogy import grade_analogy_simulate
        outcome = await grade_analogy_simulate(
            key, text, answer_payload, settings,
            embed_texts=embed_texts, claim_embeddings=claim_embeddings,
        )
        if outcome is not None:
            return outcome
        # No mapped-relation delta → claim coverage over correspondences.
        if not text.strip():
            return grade_empty(key, settings)

    elif probe_type == "ANALOGY_BREAKDOWN":
        if not text.strip():
            return grade_empty(key, settings)
        from app.grading.analogy import grade_analogy_breakdown
        outcome = await grade_analogy_breakdown(
            key, text, settings,
            embed_texts=embed_texts, claim_embeddings=claim_embeddings,
            get_nli=get_nli,
        )
        if outcome is not None:
            return outcome
        # No authored divergences → claim coverage fallback.

    if not text.strip():
        return grade_empty(key, settings)

    # PROCEDURAL (§5.8.4): execution / symbolic-evaluation grading is
    # intentionally deferred — it needs sandbox infrastructure (code execution,
    # a symbolic algebra system) not present here. Until then it degrades to
    # the claim-coverage path below (with ordering weights via ORDERED_SHAPES),
    # which scores the learner's described procedure rather than running it.
    # ANALOGY_FORWARD (§9.5) is deliberately the coverage path over the
    # correspondence relations.

    indices: Optional[list[int]] = None
    if probe_type == "CLOZE":
        exact = grade_cloze_exact(key, text, settings)
        if exact is not None:
            return exact
        if key.target_claim_index is not None:
            indices = [key.target_claim_index]

    return await grade_claim_coverage(
        key, text, settings,
        embed_texts=embed_texts, claim_embeddings=claim_embeddings,
        get_nli=get_nli, indices=indices,
    )
