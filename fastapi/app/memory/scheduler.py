"""Curriculum selection and review queue construction (Â§5.20, Â§6.9).

Priority formula (Â§5.20):
    priority(v) = (1 âˆ’ R_v) Â· readiness(v) Â· centrality(v)^Îº Â· recency_guard(v)

Readiness â€” weakest-link rule:
    readiness(v) = min(R_p for p in prereqs(v))  or 1.0 if no prereqs
    Minimum not product: broad foundations shouldn't be penalised.

Centrality â€” normalised PageRank, Îº = 0.50 to soften influence.

Recency guard:
    0 if hours < 12 since last attempt, 1 otherwise.

Prerequisite detour (Â§5.20.1):
    Before probing, walk REQUIRES edges. If R_p < R_v âˆ’ Î´ (Î´=0.10),
    redirect to probe p first. Max depth 2 levels.
    ðŸ”’ Detour must be VISIBLE to the learner.

Review queue (Â§6.9):
    Default session size: 8 items.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID

# Constants (Â§5.26)
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
    is_new: bool = False
    detour_for: Optional[str] = None
    # Locked (UNRESOLVED_PREREQUISITE) prerequisites: surfaced as "gap to
    # fill", never probed, never blocking (Â§5.20.1).
    prerequisite_gaps: list = field(default_factory=list)


def compute_centrality(
    node_ids: list[str],
    edges: list[tuple[str, str, float]],
    damping: float = 0.85,
    iterations: int = 50,
    tol: float = 1e-9,
) -> dict[str, float]:
    """Normalised PageRank over the undirected, weighted concept graph (Â§5.20).

    Edges are treated as undirected (each contributes both directions).
    Dangling mass is spread uniformly. The result is divided by the max so
    the most central node has centrality 1.0; with no edges every node gets
    1.0 (no information â†’ no preference).
    """
    nodes = list(dict.fromkeys(node_ids))
    if not nodes:
        return {}
    index = {n: i for i, n in enumerate(nodes)}
    n = len(nodes)
    adj: list[dict[int, float]] = [dict() for _ in range(n)]
    for u, v, w in edges:
        if u not in index or v not in index or u == v:
            continue
        w = float(w) if w is not None and w > 0 else 1.0
        iu, iv = index[u], index[v]
        adj[iu][iv] = adj[iu].get(iv, 0.0) + w
        adj[iv][iu] = adj[iv].get(iu, 0.0) + w
    if not any(adj):
        return {node: 1.0 for node in nodes}

    out_w = [sum(a.values()) for a in adj]
    rank = [1.0 / n] * n
    for _ in range(iterations):
        dangling = sum(rank[i] for i in range(n) if out_w[i] == 0.0)
        new = [(1.0 - damping) / n + damping * dangling / n] * n
        for i in range(n):
            if out_w[i] == 0.0:
                continue
            share = damping * rank[i] / out_w[i]
            for j, w in adj[i].items():
                new[j] += share * w
        delta = sum(abs(a - b) for a, b in zip(new, rank))
        rank = new
        if delta < tol:
            break
    top = max(rank)
    return {node: (rank[index[node]] / top if top > 0 else 1.0) for node in nodes}


def calculate_readiness(prereq_recalls: list[float]) -> float:
    """Compute readiness via weakest-link rule (Â§5.20).

    readiness(v) = min(R_p for p in prereqs(v))  if non-empty
                 = 1.0                            otherwise

    Minimum rather than product: a product would penalise a concept
    merely for having many prerequisites even when all are strong.
    """
    if not prereq_recalls:
        return 1.0
    return min(prereq_recalls)


def calculate_recency_guard(
    hours_since_last_attempt: float,
    guard_hours: float = RECENCY_GUARD_HOURS,
) -> float:
    """Compute recency guard (Â§5.20).

    Returns 0 if hours < 12 (suppress re-testing), 1 otherwise.
    """
    if hours_since_last_attempt < guard_hours:
        return 0.0
    return 1.0


def calculate_priority(
    recall: float,
    prereq_recalls: list[float],
    centrality: float,
    hours_since_last_attempt: float,
    kappa: float = CENTRALITY_KAPPA,
    recency_guard_hours: float = RECENCY_GUARD_HOURS,
) -> float:
    """Compute curriculum priority score (Â§5.20).

    priority(v) = (1 âˆ’ R_v) Â· readiness(v) Â· centrality(v)^Îº Â· recency_guard(v)

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
    recency = calculate_recency_guard(hours_since_last_attempt, recency_guard_hours)

    return urgency * readiness * centrality_factor * recency


def check_prerequisite_detour(
    concept_recall: float,
    prereq_recalls: dict[str, float],
    delta: float = DETOUR_DELTA,
) -> Optional[str]:
    """Check if a prerequisite detour is needed (Â§5.20.1).

    Walk REQUIRES edges: if R_p < R_v âˆ’ Î´, redirect to probe p first.
    Returns the concept_id of the weakest prerequisite needing detour,
    or None if no detour is needed.

    Args:
        concept_recall: R_v for the target concept.
        prereq_recalls: mapping of prereq concept_id â†’ R_p.
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



def _item_from(info: dict, **overrides) -> ReviewItem:
    fields = {
        "concept_id": info["concept_id"],
        "concept_label": info["concept_label"],
        "recall_probability": info["recall_probability"],
        "priority_score": info.get("priority_score", 0.0),
        "solo_level": info.get("solo_level") or "Prestructural",
        "complexity": info.get("complexity") if info.get("complexity") is not None else 1.0,
        "is_new": bool(info.get("is_new")),
        "prerequisite_gaps": list(info.get("prerequisite_gaps") or []),
    }
    fields.update(overrides)
    return ReviewItem(**fields)


def build_review_queue(
    candidates: list[dict],
    session_size: int = DEFAULT_SESSION_SIZE,
    concept_index: Optional[dict[str, dict]] = None,
    delta: float = DETOUR_DELTA,
    max_depth: int = MAX_DETOUR_DEPTH,
) -> list[ReviewItem]:
    """Build the review queue from scored candidates (§6.9, §5.20.1).

    1. Sort candidates by priority descending.
    2. For each selected v, walk REQUIRES: if the weakest probe-able
       prerequisite p has R_p < R_v − δ, emit p first as a visible detour,
       repeating from p up to ``max_depth`` levels (deepest foundation first).
    3. De-duplicate preserving first occurrence; trim to session_size.

    Detour items are built from the prerequisite's own row in
    ``concept_index`` (real label, recall, SOLO level, complexity). A
    prerequisite without a row there (locked, not probe-eligible, unknown)
    is never detoured to.

    Args:
        candidates: dicts with concept_id, concept_label, recall_probability,
            priority_score, solo_level, complexity, prereq_recalls
            (dict[str, float]), optional is_new / prerequisite_gaps.
        session_size: max items in the queue (default 8).
        concept_index: concept_id → same-shaped dict for every probe-able
            concept (candidates and non-candidate prerequisites).
    """
    index = dict(concept_index or {})
    for c in candidates:
        index.setdefault(c["concept_id"], c)

    sorted_candidates = sorted(
        candidates, key=lambda c: c.get("priority_score", 0.0), reverse=True,
    )

    queue: list[ReviewItem] = []
    seen: set[str] = set()

    def push(item: ReviewItem) -> None:
        if item.concept_id not in seen and len(queue) < session_size:
            seen.add(item.concept_id)
            queue.append(item)

    for candidate in sorted_candidates:
        if len(queue) >= session_size:
            break

        chain: list[tuple[dict, dict]] = []   # (prereq info, dependent info)
        current = candidate
        visited = {candidate["concept_id"]}
        for _ in range(max_depth):
            detourable = {
                pid: r for pid, r in (current.get("prereq_recalls") or {}).items()
                if pid in index and pid not in visited
            }
            target = check_prerequisite_detour(
                current["recall_probability"], detourable, delta,
            ) if detourable else None
            if not target:
                break
            chain.append((index[target], current))
            visited.add(target)
            current = index[target]

        for prereq, dependent in reversed(chain):
            push(_item_from(
                prereq,
                priority_score=candidate.get("priority_score", 0.0),
                is_detour=True,
                detour_for=dependent["concept_id"],
                detour_reason=(
                    f"Testing {prereq['concept_label']} first because "
                    f"{dependent['concept_label']} depends on it"
                ),
            ))

        push(_item_from(candidate))

    return queue[:session_size]
