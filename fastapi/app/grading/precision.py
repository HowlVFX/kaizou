"""Assertion precision calculation (§5.4).

precision = Σ(supported(s_j)) / m

where m = |S| is the number of claims the learner actually asserted.
Penalises padding, invention, and hedging with irrelevant material.

Edge case: if m = 0 (empty answer), precision is 0 and the whole attempt
short-circuits to "Not yet engaged" (§5.4, §5.9.2).
"""

from __future__ import annotations


def calculate_precision(
    supported_claims: list[bool],
    total_asserted: int,
) -> float:
    """Compute assertion precision.

    Args:
        supported_claims: boolean per learner claim — is it supported by
                          any required claim above threshold τ?
        total_asserted: total number of claims the learner asserted (m).
                        Must equal len(supported_claims) unless the caller
                        has a different segmentation.

    Returns:
        Fraction of learner assertions that have support in [0, 1].
        Returns 0.0 if total_asserted == 0 (empty answer).
    """
    if total_asserted <= 0:
        return 0.0

    supported_count = sum(1 for s in supported_claims if s)
    return supported_count / total_asserted