"""Cognitive telemetry (§5.24).

🔒 Three separate signals, never collapsed into one number.

1. SOLO level — categorical
   Prestructural → Unistructural → Multistructural → Relational → Extended Abstract

2. Absorption efficiency
   μ = (Σ N_min / Σ N_actual) · 100

3. Recall coverage heat-map
   Fraction of the learner's concept graph where R >= 0.50.

SOLO advancement rules (§5.24.1):
    Unistructural   ← 1 claim matched on any probe
    Multistructural ← >= 3 claims matched, no transition claims required
    Relational      ← all transition claims matched on >= 2 distinct probe types
                      OR a passed perturbation probe (delta_score >= 0.70)
    Extended Abstr. ← a passed far-transfer probe (score >= 0.85)

🔒 Passing more isolated-fact probes never advances past Multistructural.
The 3→4 jump is qualitative, not quantitative.
"""
from __future__ import annotations

from enum import IntEnum


class SOLOLevel(IntEnum):
    """SOLO taxonomy levels with integer ordering."""
    PRESTRUCTURAL = 0
    UNISTRUCTURAL = 1
    MULTISTRUCTURAL = 2
    RELATIONAL = 3
    EXTENDED_ABSTRACT = 4

    @classmethod
    def from_string(cls, s: str) -> "SOLOLevel":
        mapping = {
            "Prestructural": cls.PRESTRUCTURAL,
            "Unistructural": cls.UNISTRUCTURAL,
            "Multistructural": cls.MULTISTRUCTURAL,
            "Relational": cls.RELATIONAL,
            "Extended_Abstract": cls.EXTENDED_ABSTRACT,
            "Extended Abstract": cls.EXTENDED_ABSTRACT,
        }
        return mapping.get(s, cls.PRESTRUCTURAL)

    def to_string(self) -> str:
        return [
            "Prestructural",
            "Unistructural",
            "Multistructural",
            "Relational",
            "Extended_Abstract",
        ][self.value]


def evaluate_solo_advancement(
    current_level: str,
    total_claims_matched: int,
    transition_claims_all_matched: bool,
    distinct_probe_types_with_transitions: int,
    has_passed_perturbation: bool,
    perturbation_delta: float,
    has_passed_far_transfer: bool,
    far_transfer_score: float,
) -> str:
    """Evaluate SOLO level advancement based on grading history (§5.24.1).

    🔒 Advancement rules are the whole point:
        Unistructural   ← 1 claim matched on any probe
        Multistructural ← >= 3 claims matched, no transition claims required
        Relational      ← all transition claims matched on >= 2 distinct probe types
                          OR a passed perturbation probe (delta_score >= 0.70)
        Extended Abstr. ← a passed far-transfer probe (score >= 0.85)

    Can only advance — never regress.

    Returns:
        The new SOLO level string (may be same as current if no advancement).
    """
    current = SOLOLevel.from_string(current_level)
    new_level = current

    # Check Unistructural
    if total_claims_matched >= 1 and current < SOLOLevel.UNISTRUCTURAL:
        new_level = SOLOLevel.UNISTRUCTURAL

    # Check Multistructural
    if total_claims_matched >= 3 and current < SOLOLevel.MULTISTRUCTURAL:
        new_level = SOLOLevel.MULTISTRUCTURAL

    # Check Relational — qualitative jump
    relational_via_transitions = (
        transition_claims_all_matched
        and distinct_probe_types_with_transitions >= 2
    )
    relational_via_perturbation = (
        has_passed_perturbation and perturbation_delta >= 0.70
    )
    if (relational_via_transitions or relational_via_perturbation) and current < SOLOLevel.RELATIONAL:
        new_level = SOLOLevel.RELATIONAL

    # Check Extended Abstract
    if has_passed_far_transfer and far_transfer_score >= 0.85 and current < SOLOLevel.EXTENDED_ABSTRACT:
        new_level = SOLOLevel.EXTENDED_ABSTRACT

    return new_level.to_string()


def calculate_absorption_efficiency(
    concept_stats: list[dict],
) -> float:
    """Compute absorption efficiency μ (§5.24.2).

    μ = (Σ N_min / Σ N_actual) · 100

    where N_min is the theoretical minimum probes to mastery and
    N_actual is the actual number of probes taken.

    A learner who masters every concept on minimum probes scores 100%.
    """
    total_n_min = 0
    total_n_actual = 0

    for stat in concept_stats:
        n_min = stat.get("n_req", 3)   # Frozen N_req
        n_actual = stat.get("attempts", 0)
        if n_actual > 0:
            total_n_min += n_min
            total_n_actual += n_actual

    if total_n_actual == 0:
        return 0.0

    return (total_n_min / total_n_actual) * 100.0


def calculate_recall_coverage(
    concept_recalls: list[float],
    threshold: float = 0.50,
) -> float:
    """Compute recall coverage heat-map metric (§5.24.3).

    Fraction of the learner's concept graph where R >= threshold.
    """
    if not concept_recalls:
        return 0.0

    above = sum(1 for r in concept_recalls if r >= threshold)
    return above / len(concept_recalls)
