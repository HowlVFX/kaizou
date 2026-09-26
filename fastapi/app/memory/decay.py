"""Memory decay calculations (§5.17).

Core formula: R(Δt) = 2^(−Δt / h)

🔒 (D-21) R is computed on read. There is no nightly recalculation job —
it is a pure function of three stored values and the clock.

Half-life dynamics:
    Initial:  h_0 = 1 day / C
    Success:  h_{k+1} = h_k · (1 + (s/C) · e^(−λ·p))    λ=1.5
    Failure:  h_{k+1} = max(h_min, h_k · ρ)               ρ=0.50
              h_min = 0.5 / C  days

    The e^(−λp) spacing effect: succeeding when predicted recall was LOW
    produces a large multiplier (effortful retrieval → consolidation).
    Succeeding when p ≈ 1 produces almost no gain (wasted review).

Stagnation decay for ANALOGY track (§5.17.4):
    Same functional form, but Δt resets on interaction (edit, link, synthesis)
    rather than graded recall. h_{k+1} = h_k · (1 + e · κ_s), κ_s = 0.60.

Node colour on graph (§5.17.1):
    R ≥ 0.75         green
    0.50 ≤ R < 0.75  amber
    R < 0.50          red
    locked node       grey, R undefined
    decay_exempt      gold, R pinned to 1.0
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

# Constants (§5.26)
PASS_THRESHOLD: float = 0.50        # s_pass: score threshold for success
SPACING_LAMBDA: float = 1.5         # λ: spacing effect sharpness
FAILURE_MULTIPLIER: float = 0.50    # ρ: half-life failure multiplier
STAGNATION_KAPPA: float = 0.60      # κ_s: analogy engagement gain


def calculate_recall_probability(
    last_reviewed: datetime,
    half_life_days: float,
    decay_exempt: bool = False,
    current_time: Optional[datetime] = None,
) -> float:
    """Compute recall probability R(Δt) = 2^(−Δt / h).

    🔒 (D-21) Computed on every read. No batch job.

    Args:
        last_reviewed: timestamp of the last successful review.
        half_life_days: current half-life h in days.
        decay_exempt: if True, returns 1.0 (mastery pin).
        current_time: override for testing; defaults to now(UTC).

    Returns:
        R in [0, 1]. At Δt = h, R = 0.5 by construction.
        Returns 1.0 if decay_exempt.
        Returns 1.0 if last_reviewed is None (never reviewed, pre-first-probe).
    """
    if decay_exempt:
        return 1.0

    if current_time is None:
        current_time = datetime.now(timezone.utc)

    # Ensure timezone-aware comparison
    if last_reviewed.tzinfo is None:
        last_reviewed = last_reviewed.replace(tzinfo=timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)

    delta_seconds = (current_time - last_reviewed).total_seconds()
    delta_days = delta_seconds / 86400.0

    if delta_days <= 0.0:
        return 1.0

    if half_life_days <= 0.0:
        return 0.0

    return 2.0 ** (-delta_days / half_life_days)


def calculate_initial_half_life(complexity: float) -> float:
    """Compute the initial half-life h_0 = 1 day / C (§5.17.2).

    A trivial concept (C=0.5) starts with 2-day half-life.
    A dense concept (C=2.0) starts with 12-hour half-life.
    Complex material is tested sooner — correct direction.

    Args:
        complexity: C value, clamped to [0.5, 2.0].

    Returns:
        h_0 in days.
    """
    c = max(0.5, min(2.0, complexity))
    return 1.0 / c


def calculate_h_min(complexity: float) -> float:
    """Compute the minimum half-life floor: h_min = 0.5 / C days (§5.17.3).

    Guarantees a failed concept returns to the queue quickly.
    """
    c = max(0.5, min(2.0, complexity))
    return 0.5 / c


def update_half_life(
    h_current: float,
    score: float,
    predicted_recall: float,
    complexity: float,
    s_pass: float = PASS_THRESHOLD,
    lambda_spacing: float = SPACING_LAMBDA,
    rho_failure: float = FAILURE_MULTIPLIER,
) -> float:
    """Update half-life based on a graded attempt (§5.17.3).

    On success (s >= s_pass):
        h_{k+1} = h_k · (1 + (s/C) · e^(−λ·p))

    On failure (s < s_pass):
        h_{k+1} = max(h_min, h_k · ρ)

    Args:
        h_current: current half-life in days.
        score: composite score or binary outcome [0, 1].
        predicted_recall: R(Δt) predicted immediately before the attempt.
        complexity: concept complexity C.
        s_pass: pass threshold (default 0.50).
        lambda_spacing: spacing effect factor (default 1.5).
        rho_failure: failure multiplier (default 0.50).

    Returns:
        New half-life in days.
    """
    c = max(0.5, min(2.0, complexity))
    h_min = calculate_h_min(c)

    if score >= s_pass:
        # Success: spacing effect — effortful retrieval → large multiplier
        spacing_bonus = math.exp(-lambda_spacing * predicted_recall)
        multiplier = 1.0 + (score / c) * spacing_bonus
        return h_current * multiplier
    else:
        # Failure: halve half-life, with floor
        return max(h_min, h_current * rho_failure)


def update_stagnation_half_life(
    h_current: float,
    engaged: bool,
    kappa_s: float = STAGNATION_KAPPA,
) -> float:
    """Update half-life for ANALOGY track stagnation decay (§5.17.4).

    h_{k+1} = h_k · (1 + e · κ_s)

    where e ∈ {0, 1} is the engagement flag. An analogy node that is
    never revisited fades; one that keeps getting linked stays alive.

    Args:
        h_current: current half-life in days.
        engaged: True if the learner interacted (edited, linked, synthesis).
        kappa_s: engagement gain factor (default 0.60).

    Returns:
        New half-life in days.
    """
    e = 1.0 if engaged else 0.0
    return h_current * (1.0 + e * kappa_s)


def classify_recall_colour(
    recall: float,
    is_locked: bool = False,
    is_decay_exempt: bool = False,
) -> str:
    """Map recall probability to graph node colour (§5.17.1).

    R >= 0.75         → green
    0.50 <= R < 0.75  → amber
    R < 0.50          → red
    locked node       → grey (R undefined)
    decay_exempt      → gold (R pinned to 1.0)
    """
    if is_locked:
        return "grey"
    if is_decay_exempt:
        return "gold"
    if recall >= 0.75:
        return "green"
    elif recall >= 0.50:
        return "amber"
    else:
        return "red"
