"""Mastery tracking and complexity model (§5.18–5.19).

Mastery (§5.18):
    Procedural: N_req = ceil(2 + C_0) consecutive passes on novel instances.
    Claim-coverage: mean(score over last k) >= 0.85, all transitions matched
                    in at least one attempt, spanning >= 2 distinct probe types.
    🔒 N_req is frozen at first probe from C_0 and never changes (D-05).

Complexity (§5.19):
    C_struct = clamp(0.45·(A/6) + 0.35·(P/2) + 0.20·(D/180), 0.5, 2.0)
    C_0 = 0.5·C_struct + 0.5·C_bloom   (first ingest only)
    C_{k+1} = clamp(C_k + 0.10·(0.85 − s_actual), 0.5, 2.0)  (after ≥5 attempts)

Probe-count projection (§5.18.2):
    p̂_pass = (passes + 1) / (attempts + 2)     (Laplace-smoothed)
    expected_additional = remaining / max(p̂_pass, 0.1)
"""

from __future__ import annotations

import math

# Complexity bounds (§5.26)
C_MIN: float = 0.5
C_MAX: float = 2.0

# Structural complexity reference values (§5.19.1)
A_REF: int = 6       # reference claim count
P_REF: int = 2       # reference prerequisite depth
D_REF: int = 180     # reference note token density
W_CLAIMS: float = 0.45
W_DEPTH: float = 0.35
W_DENSITY: float = 0.20

# Observed complexity adjustment (§5.19.3)
ALPHA: float = 0.10          # learning rate
S_TARGET: float = 0.85       # target score for correction
MIN_ATTEMPTS_FOR_ADJUST: int = 5  # minimum graded attempts before C adjusts


# ---------------------------------------------------------------------------
# §5.19  Complexity
# ---------------------------------------------------------------------------

def compute_structural_complexity(
    claim_count: int,
    prereq_depth: int,
    token_count: int,
) -> float:
    """Compute the deterministic structural complexity C_struct (§5.19.1).

    z = 0.45·(A/A_ref) + 0.35·(P/P_ref) + 0.20·(D/D_ref)
    C_struct = clamp(z, 0.5, 2.0)

    Reference values calibrated so a typical concept yields z ≈ 1.0.
    Claims weighted highest, density lowest — token count is the weakest
    proxy for difficulty (§5.19.1).
    """
    z = (W_CLAIMS * (claim_count / A_REF) +
         W_DEPTH * (prereq_depth / P_REF) +
         W_DENSITY * (token_count / D_REF))

    return max(C_MIN, min(C_MAX, z))


def compute_initial_complexity(
    c_struct: float,
    c_bloom: float,
) -> float:
    """Compute initial composite complexity C_0 = 0.5·C_struct + 0.5·C_bloom (§5.19.2).

    🔒 Applied at first ingest only. Never recomputed. It is a prior.

    Args:
        c_struct: structural complexity [0.5, 2.0].
        c_bloom: Bloom taxonomy prior — 0.5 (factual), 1.0 (comprehension),
                 1.5 (application), 2.0 (synthesis).

    Returns:
        C_0 clamped to [0.5, 2.0].
    """
    c_0 = 0.5 * c_struct + 0.5 * c_bloom
    return max(C_MIN, min(C_MAX, c_0))


def update_observed_complexity(
    c_current: float,
    actual_score: float,
    graded_attempts: int,
) -> float:
    """Update complexity based on observed performance (§5.19.3).

    C_{k+1} = clamp(C_k + α·(s_target − s_actual), 0.5, 2.0)

    Direction: if learner scores 1.0 on a "hard" concept, C decreases
    (easing off). If they score 0.3, C increases. Small α prevents one
    anomalous attempt from swinging the schedule.

    🔒 Not applied below 5 graded attempts — sample too small.

    Args:
        c_current: current complexity value.
        actual_score: most recent composite score [0, 1].
        graded_attempts: total graded attempts for this concept.

    Returns:
        Updated complexity, or c_current unchanged if < 5 attempts.
    """
    if graded_attempts < MIN_ATTEMPTS_FOR_ADJUST:
        return c_current

    adjustment = ALPHA * (S_TARGET - actual_score)
    c_new = c_current + adjustment
    return max(C_MIN, min(C_MAX, c_new))


# ---------------------------------------------------------------------------
# §5.18  Mastery
# ---------------------------------------------------------------------------

def calculate_required_streak(
    c_0: float,
    is_procedural: bool,
) -> int:
    """Compute the frozen mastery streak requirement N_req (§5.18.1).

    Procedural: N_req = ceil(2 + C_0)
        C=0.5 → 3, C=1.0 → 3, C=2.0 → 4

    Claim-coverage: returns the k value = max(2, ceil(C_0 + 1))
        This is the window size for the mean-score check.

    🔒 Computed once at first probe from C_0 and frozen (D-05).
    """
    if is_procedural:
        return math.ceil(2 + c_0)
    else:
        return max(2, math.ceil(c_0 + 1))


def check_mastery_procedural(
    current_streak: int,
    n_req: int,
) -> bool:
    """Check mastery for procedural shapes (§5.18.1).

    Simple: current_streak >= N_req consecutive passes on novel instances.
    Any failure resets streak to zero.
    """
    return current_streak >= n_req


def check_mastery_claim_coverage(
    recent_scores: list[float],
    recent_transition_coverage: list[bool],
    recent_probe_types: list[str],
    n_req: int,
) -> bool:
    """Check mastery for claim-coverage shapes (§5.18.1).

    All three conditions must hold:
        1. mean(score over last k attempts) >= 0.85,  k = N_req
        2. every transition-weighted claim matched in at least one of those k
        3. those k attempts span at least 2 distinct probe types

    Condition 3 stops a learner grinding the same cloze question to mastery.

    Args:
        recent_scores: scores from the last k attempts (most recent first).
        recent_transition_coverage: bool per attempt — did all transitions match?
        recent_probe_types: probe type per attempt.
        n_req: window size (frozen N_req).

    Returns:
        True if all three conditions are satisfied.
    """
    k = n_req

    # Need at least k attempts
    if len(recent_scores) < k:
        return False

    window_scores = recent_scores[:k]
    window_transitions = recent_transition_coverage[:k]
    window_types = recent_probe_types[:k]

    # Condition 1: mean score >= 0.85
    mean_score = sum(window_scores) / k
    if mean_score < 0.85:
        return False

    # Condition 2: all transitions matched in at least one attempt
    if not any(window_transitions):
        return False

    # Condition 3: at least 2 distinct probe types
    distinct_types = len(set(window_types))
    if distinct_types < 2:
        return False

    return True


def project_additional_probes(
    n_req: int,
    current_streak: int,
    passes: int,
    attempts: int,
) -> float:
    """Project remaining probes to mastery (§5.18.2).

    remaining = max(0, N_req − current_streak)
    p̂_pass = (passes + 1) / (attempts + 2)     # Laplace-smoothed
    expected_additional = remaining / max(p̂_pass, 0.1)

    With zero attempts p̂_pass = 0.5 (sane first projection via smoothing).

    Returns:
        Expected additional probes needed (float).
    """
    remaining = max(0, n_req - current_streak)

    if remaining == 0:
        return 0.0

    # Laplace-smoothed pass rate
    p_hat = (passes + 1) / (attempts + 2)
    p_hat = max(p_hat, 0.1)  # floor to avoid extreme projections

    return remaining / p_hat


def can_exempt_decay(
    current_streak: int,
    n_req: int,
    mastery_achieved: bool,
) -> bool:
    """Check if decay exemption is eligible (§5.18.3).

    eligible = 𝟙(current_streak >= N_req AND mastery_achieved)

    Only once eligible may the learner set decay_exempt = true,
    which pins R = 1.0 and removes the concept from all queues.

    Gating justification: by the time N_req consecutive passes at
    expanding intervals, the half-life is long enough that further
    prompting is noise. Allowing exemption before that lets the learner
    opt out based on the illusion of knowing (§5.18.3).
    """
    return current_streak >= n_req and mastery_achieved
