"""Ordering score via Kendall's τ_b (§5.5).

Applies only to ORDERED_PROCESS and PROCEDURAL shapes.

Construction (§5.5.1):
    For each matched required claim c_i with a canonical order index:
      π(i) = canonical order index in the template
      σ(i) = position in the learner's answer by character offset

Kendall τ_b (§5.5.2):
    tau_b = (P − Q) / sqrt((P+Q+T) · (P+Q+U))
    where P = concordant pairs, Q = discordant pairs,
          T = ties in π only, U = ties in σ only

    Tau-b rather than tau-a because a learner may mention two steps in the
    same sentence, producing genuine ties in σ.

    Rescaled: ordering = (tau_b + 1) / 2  →  [0, 1]

Edge case (D-22, §5.5.3):
    If k < 2, tau is undefined. The ordering term is dropped entirely and
    remaining composite weights are renormalised.
"""

from __future__ import annotations

import math
from itertools import combinations
from typing import Optional


def calculate_kendall_tau_b(
    canonical_order: list[int],
    learner_offsets: list[int],
) -> Optional[float]:
    """Compute Kendall's τ_b between canonical and learner orderings.

    Args:
        canonical_order: π(i) for each matched claim — canonical step index.
        learner_offsets: σ(i) for each matched claim — character offset of
                        first mention in the learner's answer.

    Returns:
        τ_b in [-1, 1], or None if k < 2 (D-22).

    Raises:
        ValueError: if the two lists have different lengths.
    """
    if len(canonical_order) != len(learner_offsets):
        raise ValueError(
            f"Length mismatch: {len(canonical_order)} canonical vs "
            f"{len(learner_offsets)} learner offsets"
        )

    k = len(canonical_order)
    if k < 2:
        return None

    concordant = 0   # P
    discordant = 0   # Q
    ties_pi = 0      # T — tied in canonical only
    ties_sigma = 0   # U — tied in learner only

    for (idx_a, idx_b) in combinations(range(k), 2):
        pi_diff = canonical_order[idx_a] - canonical_order[idx_b]
        sigma_diff = learner_offsets[idx_a] - learner_offsets[idx_b]

        pi_sign = _sign(pi_diff)
        sigma_sign = _sign(sigma_diff)

        if pi_sign == 0 and sigma_sign == 0:
            # Tied in both — contributes to neither T nor U
            pass
        elif pi_sign == 0:
            ties_pi += 1
        elif sigma_sign == 0:
            ties_sigma += 1
        elif pi_sign == sigma_sign:
            concordant += 1
        else:
            discordant += 1

    denominator_sq = (concordant + discordant + ties_pi) * \
                     (concordant + discordant + ties_sigma)

    if denominator_sq == 0:
        # All pairs are tied — no ordering information
        return 0.0

    return (concordant - discordant) / math.sqrt(denominator_sq)


def calculate_ordering_score(tau_b: Optional[float]) -> Optional[float]:
    """Rescale τ_b from [-1, 1] to [0, 1].

    ordering = (tau_b + 1) / 2

    Returns None if tau_b is None (k < 2 edge case), signalling that the
    ordering term should be dropped from the composite score and weights
    renormalised (§5.5.3, §5.8.2).
    """
    if tau_b is None:
        return None
    return (tau_b + 1.0) / 2.0


def _sign(x: int | float) -> int:
    """Return -1, 0, or 1."""
    if x > 0:
        return 1
    elif x < 0:
        return -1
    return 0