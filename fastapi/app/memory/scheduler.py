"""Curriculum selection and review queue construction (§5.20, §6.9).

Priority formula (§5.20):
    priority(v) = (1 − R_v) · readiness(v) · centrality(v)^κ · recency_guard(v)

Readiness — weakest-link rule:
    readiness(v) = min(R_p for p in prereqs(v))  or 1.0 if no prereqs
    Minimum not product: broad foundations shouldn't be penalised.

Centrality — normalised PageRank, κ = 0.50 to soften influence.

Recency guard:
    0 if hours < 12 since last attempt, 1 otherwise.

Prerequisite detour (§5.20.1):
    Before probing, walk REQUIRES edges. If R_p < R_v − δ (δ=0.10),
    redirect to probe p first. Max depth 2 levels.
    🔒 Detour must be VISIBLE to the learner.

Review queue (§6.9):
    Default session size: 8 items.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

# Constants (§5.26)
CENTRALITY_KAPPA: float = 0.50       # PageRank exponent
RECENCY_GUARD_HOURS: float = 12.0    # cooldown before re-testing
DETOUR_DELTA: float = 0.10           # prerequisite detour margin
MAX_DETOUR_DEPTH: int = 2            # max redirect hops
DEFAULT_SESSION_SIZE: int = 8        # default review queue size


@dataclass
class ReviewItem:
    """A single item in the review queue."""
    concept_id: str
    concept_label: str
    recall_probability: float
    priority_score: float
    is_detour: bool = False
    detour_reason: Optional[str] = None
    solo_level: str = "Prestructural"
    complexity: float = 1.0


def calculate_readiness(prereq_recalls: list[float]) -> float:
    """Compute readiness via weakest-link rule (§5.20).

    readiness(v) = min(R_p for p in prereqs(v))  if non-empty
                 = 1.0                            otherwise

    Minimum rather than product: a product would penalise a concept
    merely for having many prerequisites even when all are strong.
    """
    if not prereq_recalls:
        return 1.0
    return min(prereq_recalls)


def calculate_recency_guard(hours_since_last_attempt: float) -> float:
    """Compute recency guard (§5.20).

    Returns 0 if hours < 12 (suppress re-testing), 1 otherwise.
    """
    if hours_since_last_attempt < RECENCY_GUARD_HOURS:
        return 0.0
    return 1.0


def calculate_priority(
    recall: float,
    prereq_recalls: list[float],
    centrality: float,
    hours_since_last_attempt: float,
    kappa: float = CENTRALITY_KAPPA,
) -> float:
    """Compute curriculum priority score (§5.20).

    priority(v) = (1 − R_v) · readiness(v) · centrality(v)^κ · recency_guard(v)

    Args:
        recall: current recall probability R_v [0, 1].
        prereq_recalls: recall probabilities of all prerequisite concepts.
        centrality: normalised PageRank value [0, 1].
        hours_since_last_attempt: hours since last probe attempt.
        kappa: centrality exponent (default 0.50).

    Returns:
        Priority score (higher = should be tested sooner).
        Returns 0.0 if within the recency guard window.
    """
    urgency = 1.0 - recall
    readiness = calculate_readiness(prereq_recalls)
    centrality_factor = centrality ** kappa if centrality > 0 else 0.0
    recency = calculate_recency_guard(hours_since_last_attempt)

    return urgency * readiness * centrality_factor * recency


def check_prerequisite_detour(
    concept_recall: float,
    prereq_recalls: dict[str, float],
    delta: float = DETOUR_DELTA,
) -> Optional[str]:
    """Check if a prerequisite detour is needed (§5.20.1).

    Walk REQUIRES edges: if R_p < R_v − δ, redirect to probe p first.
    Returns the concept_id of the weakest prerequisite needing detour,
    or None if no detour is needed.

    Args:
        concept_recall: R_v for the target concept.
        prereq_recalls: mapping of prereq concept_id → R_p.
        delta: margin (default 0.10).

    Returns:
        concept_id of the prerequisite to detour to, or None.
    """
    threshold = concept_recall - delta
    weakest_id: Optional[str] = None
    weakest_recall = float("inf")

    for prereq_id, prereq_recall in prereq_recalls.items():
        if prereq_recall < threshold and prereq_recall < weakest_recall:
            weakest_recall = prereq_recall
            weakest_id = prereq_id

    return weakest_id


def build_review_queue(
    candidates: list[dict],
    session_size: int = DEFAULT_SESSION_SIZE,
) -> list[ReviewItem]:
    """Build the review queue from scored candidates (§6.9).

    Takes pre-scored concept dicts with priority scores and applies
    prerequisite detour logic, returning an ordered queue.

    Args:
        candidates: list of dicts with keys:
            concept_id, concept_label, recall_probability, priority_score,
            solo_level, complexity, prereq_recalls (dict[str, float])
        session_size: max items in the queue (default 8).

    Returns:
        Ordered list of ReviewItems, highest priority first.
        Detoured items are marked with is_detour=True and a reason string.
    """
    # Sort by priority descending
    sorted_candidates = sorted(
        candidates,
        key=lambda c: c.get("priority_score", 0.0),
        reverse=True,
    )

    queue: list[ReviewItem] = []
    detour_depth = 0

    for candidate in sorted_candidates:
        if len(queue) >= session_size:
            break

        concept_id = candidate["concept_id"]
        concept_label = candidate["concept_label"]
        recall = candidate["recall_probability"]
        priority = candidate["priority_score"]
        solo = candidate.get("solo_level", "Prestructural")
        complexity = candidate.get("complexity", 1.0)
        prereq_recalls = candidate.get("prereq_recalls", {})

        # Check for prerequisite detour
        detour_target = None
        if detour_depth < MAX_DETOUR_DEPTH and prereq_recalls:
            detour_target = check_prerequisite_detour(recall, prereq_recalls)

        if detour_target:
            # Insert detour item before the original
            queue.append(ReviewItem(
                concept_id=detour_target,
                concept_label=f"Prerequisite of {concept_label}",
                recall_probability=prereq_recalls[detour_target],
                priority_score=priority + 0.01,  # slightly higher to sort first
                is_detour=True,
                detour_reason=(
                    f"Testing this first because {concept_label} depends on it"
                ),
                solo_level=solo,
                complexity=complexity,
            ))
            detour_depth += 1

        queue.append(ReviewItem(
            concept_id=concept_id,
            concept_label=concept_label,
            recall_probability=recall,
            priority_score=priority,
            solo_level=solo,
            complexity=complexity,
        ))

    # Final sort by priority and trim to session_size
    queue.sort(key=lambda item: item.priority_score, reverse=True)
    return queue[:session_size]
