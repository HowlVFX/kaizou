"""Composite score, understanding bands, and branch leakage (§5.7–5.8).

Composite score (§5.8):
    Ordered shapes (k ≥ 2):
        raw = 0.55·coverage + 0.15·ordering + 0.30·precision
        score = clamp(raw − γ·verbatim − β·L, 0, 1)

    Unordered shapes or k < 2:
        raw = 0.647·coverage + 0.353·precision   (renormalised)
        score = clamp(raw − γ·verbatim − β·L, 0, 1)

    γ = 0.20, β = 0.25

Band classification (§5.8.3):
    Full understanding:     score ≥ 0.85 AND all transition claims matched
    Shallow understanding:  score ≥ 0.50
    Incomplete:             score ≥ 0.20
    Not yet engaged:        score < 0.20

    The conjunction on Full: a high score achieved while missing a
    transition claim caps out at Shallow.

Branch leakage (§5.7):
    L = min(1, leaked_weight / target_weight)
    Reports erroneous mention of non-target branch content.
"""

from __future__ import annotations

from typing import Optional

# Composite weight constants (§5.8, §5.26)
W_COVERAGE: float = 0.55
W_ORDERING: float = 0.15
W_PRECISION: float = 0.30

# Renormalised weights when ordering is dropped (§5.8.2)
# 0.55 / (0.55 + 0.30) = 0.647;  0.30 / (0.55 + 0.30) = 0.353
W_COVERAGE_RENORM: float = W_COVERAGE / (W_COVERAGE + W_PRECISION)
W_PRECISION_RENORM: float = W_PRECISION / (W_COVERAGE + W_PRECISION)

# Penalty coefficients (§5.26)
GAMMA: float = 0.20  # verbatim penalty coefficient
BETA: float = 0.25   # branch leakage penalty coefficient

# Band thresholds (§5.8.3)
BAND_FULL: float = 0.85
BAND_SHALLOW: float = 0.50
BAND_INCOMPLETE: float = 0.20


def calculate_branch_leakage(
    matched_branch_claims: list[bool],
    branch_weights: list[float],
    target_weights: list[float],
) -> float:
    """Compute the branch leakage penalty (§5.7).

    L = min(1, leaked_weight / target_weight)

    where leaked_weight = Σ(w_c · matched(c)) for claims c in non-target
    branches, and target_weight = Σ(w_c) for claims in the target branch.

    Args:
        matched_branch_claims: bool per non-target-branch claim — did the
                               learner mention it?
        branch_weights: weight per non-target-branch claim.
        target_weights: weight per target-branch claim (used as denominator).

    Returns:
        Leakage penalty in [0, 1]. Returns 0.0 if there are no target
        branch claims or no non-target claims.
    """
    total_target = sum(target_weights)
    if total_target == 0.0:
        return 0.0

    if len(matched_branch_claims) != len(branch_weights):
        raise ValueError(
            f"Length mismatch: {len(matched_branch_claims)} matched vs "
            f"{len(branch_weights)} weights for non-target branch"
        )

    leaked_weight = sum(
        w for matched, w in zip(matched_branch_claims, branch_weights)
        if matched
    )

    return min(1.0, leaked_weight / total_target)


def calculate_composite_score(
    coverage: float,
    precision: float,
    ordering: Optional[float],
    verbatim_penalty: float,
    branch_leakage: float,
    gamma: float = GAMMA,
    beta: float = BETA,
) -> float:
    """Compute the clamped composite score (§5.8).

    If ordering is not None (ordered shapes with k ≥ 2):
        raw = 0.55·coverage + 0.15·ordering + 0.30·precision
    Else (unordered shapes or k < 2):
        raw = 0.647·coverage + 0.353·precision

    score = clamp(raw − γ·verbatim_penalty − β·branch_leakage, 0, 1)

    Args:
        coverage: weighted claim coverage [0, 1].
        precision: assertion precision [0, 1].
        ordering: ordering score [0, 1] or None if not applicable.
        verbatim_penalty: verbatim penalty [0, 1].
        branch_leakage: branch leakage penalty [0, 1].
        gamma: verbatim coefficient (default 0.20).
        beta: leakage coefficient (default 0.25).

    Returns:
        Composite score clamped to [0, 1].
    """
    if ordering is not None:
        raw = (W_COVERAGE * coverage +
               W_ORDERING * ordering +
               W_PRECISION * precision)
    else:
        raw = (W_COVERAGE_RENORM * coverage +
               W_PRECISION_RENORM * precision)

    score = raw - gamma * verbatim_penalty - beta * branch_leakage

    return max(0.0, min(1.0, score))


def classify_understanding_band(
    score: float,
    all_transitions_matched: bool,
) -> str:
    """Classify the composite score into an understanding band (§5.8.3).

    The learner sees a category, never the raw number.

    Full understanding:     score ≥ 0.85 AND all transition claims matched
    Shallow understanding:  score ≥ 0.50
    Incomplete:             score ≥ 0.20
    Not yet engaged:        score < 0.20

    The conjunction on Full: a high score with missing transition claims
    caps at Shallow — static facts alone cannot buy the top category.

    Returns:
        One of: "Full", "Shallow", "Incomplete", "Not_Yet_Engaged"
    """
    if score >= BAND_FULL and all_transitions_matched:
        return "Full"
    elif score >= BAND_SHALLOW:
        return "Shallow"
    elif score >= BAND_INCOMPLETE:
        return "Incomplete"
    else:
        return "Not_Yet_Engaged"