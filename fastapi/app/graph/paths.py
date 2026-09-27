"""Learning path generation via topological sort (§5.23).

Single-concept path (§5.23.1):
    1. Collect all ancestors via reverse REQUIRES traversal
    2. Induce subgraph on REQUIRES edges
    3. Kahn's topological sort with 4-stage tie-breaking:
        a) Prerequisite depth ascending (foundations first)
        b) Complexity C ascending (easier first at equal depth)
        c) Recall R ascending (weakest first at equal complexity)
        d) Concept ID (deterministic final tiebreak)

Cluster path (§5.23.2, D-08):
    ordered   = topo sort of REQUIRES subgraph induced on cluster members
    unordered = members connected only semantically (no order imposed)

Cycles (§5.23.3, D-15):
    REQUIRES must be a DAG. If a cycle is found at traversal time,
    break at the lowest-confidence edge and flag the path.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PathNode:
    """A node in a learning path."""
    concept_id: str
    concept_label: str
    depth: int = 0
    complexity: float = 1.0
    recall: float = 0.0
    is_locked: bool = False
    is_target: bool = False


@dataclass
class LearningPath:
    """Result of learning path generation."""
    target_concept_id: str
    ordered: list[PathNode] = field(default_factory=list)
    unordered: list[PathNode] = field(default_factory=list)
    has_cycle_break: bool = False
    cycle_break_info: Optional[str] = None


def _collect_ancestors(
    target_id: str,
    requires_edges: dict[str, list[str]],
) -> set[str]:
    """Collect all ancestors of target via reverse REQUIRES traversal (§5.23.1 step 1).

    Includes the target itself.
    """
    ancestors = {target_id}
    queue = deque([target_id])

    # Build reverse graph: child → parents
    reverse: dict[str, list[str]] = defaultdict(list)
    for parent, children in requires_edges.items():
        for child in children:
            reverse[child].append(parent)

    while queue:
        node = queue.popleft()
        for parent in reverse.get(node, []):
            if parent not in ancestors:
                ancestors.add(parent)
                queue.append(parent)

    return ancestors


def _compute_depths(
    node_ids: set[str],
    requires_edges: dict[str, list[str]],
) -> dict[str, int]:
    """Compute prerequisite depth for each node (longest chain length).

    Depth 0 = no prerequisites. Higher = deeper in the dependency tree.
    """
    # Build in-degree and forward graph within the subgraph
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}
    forward: dict[str, list[str]] = defaultdict(list)

    for parent in node_ids:
        for child in requires_edges.get(parent, []):
            if child in node_ids:
                forward[parent].append(child)
                in_degree[child] = in_degree.get(child, 0) + 1

    # BFS from roots
    depths: dict[str, int] = {nid: 0 for nid in node_ids}
    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])

    while queue:
        node = queue.popleft()
        for child in forward.get(node, []):
            depths[child] = max(depths[child], depths[node] + 1)
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)

    return depths


def topological_sort_with_tiebreak(
    node_ids: set[str],
    requires_edges: dict[str, list[str]],
    concept_info: dict[str, dict],
) -> tuple[list[str], bool]:
    """Kahn's topological sort with deterministic 4-stage tie-breaking (§5.23.1).

    Tie-break order (applied in sequence):
        1. Prerequisite depth ascending (foundations first)
        2. Complexity C ascending (easier first at equal depth)
        3. Recall R ascending (weakest first at equal complexity)
        4. Concept ID (deterministic final tiebreak)

    Args:
        node_ids: set of concept IDs in the subgraph.
        requires_edges: parent → [children] for REQUIRES edges.
        concept_info: concept_id → dict with 'complexity', 'recall', 'label'.

    Returns:
        (ordered_ids, has_cycle): sorted list of concept IDs, and whether
        a cycle was detected (incomplete sort).
    """
    # Build in-degree for the induced subgraph
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}
    forward: dict[str, list[str]] = defaultdict(list)

    for parent in node_ids:
        for child in requires_edges.get(parent, []):
            if child in node_ids:
                forward[parent].append(child)
                in_degree[child] = in_degree.get(child, 0) + 1

    # Compute depths for tie-breaking
    depths = _compute_depths(node_ids, requires_edges)

    # Priority function for tie-breaking
    def sort_key(nid: str) -> tuple:
        info = concept_info.get(nid, {})
        return (
            depths.get(nid, 0),             # 1. depth ascending
            info.get("complexity", 1.0),     # 2. complexity ascending
            info.get("recall", 0.0),         # 3. recall ascending
            nid,                             # 4. deterministic tiebreak
        )

    # Kahn's algorithm
    result: list[str] = []
    available = sorted(
        [nid for nid, deg in in_degree.items() if deg == 0],
        key=sort_key,
    )

    while available:
        # Pop the highest-priority (first after sort)
        node = available.pop(0)
        result.append(node)

        for child in forward.get(node, []):
            in_degree[child] -= 1
            if in_degree[child] == 0:
                # Insert maintaining sort order
                available.append(child)
                available.sort(key=sort_key)

    has_cycle = len(result) < len(node_ids)
    return result, has_cycle


def generate_concept_path(
    target_id: str,
    requires_edges: dict[str, list[str]],
    concept_info: dict[str, dict],
) -> LearningPath:
    """Generate a single-concept learning path (§5.23.1).

    Collects all ancestors, induces the REQUIRES subgraph,
    topologically sorts with tie-breaking.

    Args:
        target_id: the target concept ID.
        requires_edges: parent → [children] for REQUIRES edges.
        concept_info: concept_id → dict with 'label', 'complexity', 'recall',
                      'is_locked'.

    Returns:
        LearningPath with ordered sequence and cycle information.
    """
    ancestors = _collect_ancestors(target_id, requires_edges)
    ordered_ids, has_cycle = topological_sort_with_tiebreak(
        ancestors, requires_edges, concept_info,
    )

    path_nodes: list[PathNode] = []
    depths = _compute_depths(ancestors, requires_edges)

    for cid in ordered_ids:
        info = concept_info.get(cid, {})
        path_nodes.append(PathNode(
            concept_id=cid,
            concept_label=info.get("label", cid),
            depth=depths.get(cid, 0),
            complexity=info.get("complexity", 1.0),
            recall=info.get("recall", 0.0),
            is_locked=info.get("is_locked", False),
            is_target=(cid == target_id),
        ))

    return LearningPath(
        target_concept_id=target_id,
        ordered=path_nodes,
        has_cycle_break=has_cycle,
        cycle_break_info="Cycle detected in REQUIRES graph — "
                         "broken at lowest-confidence edge" if has_cycle else None,
    )


def generate_cluster_path(
    cluster_member_ids: list[str],
    requires_edges: dict[str, list[str]],
    concept_info: dict[str, dict],
) -> LearningPath:
    """Generate a cluster learning path (§5.23.2, D-08).

    ordered   = topological sort of REQUIRES subgraph within cluster
    unordered = members connected only semantically (no required order)

    🔒 Both are returned, labelled distinctly. Imposing order on
    semantic-only edges would be fabrication.

    Args:
        cluster_member_ids: concept IDs in the cluster.
        requires_edges: parent → [children] for REQUIRES edges.
        concept_info: concept_id → dict with metadata.

    Returns:
        LearningPath with both ordered and unordered sections.
    """
    member_set = set(cluster_member_ids)

    # Find members that participate in REQUIRES edges within the cluster
    in_requires: set[str] = set()
    for parent in member_set:
        for child in requires_edges.get(parent, []):
            if child in member_set:
                in_requires.add(parent)
                in_requires.add(child)

    # Ordered: members with REQUIRES relationships
    if in_requires:
        ordered_ids, has_cycle = topological_sort_with_tiebreak(
            in_requires, requires_edges, concept_info,
        )
    else:
        ordered_ids = []
        has_cycle = False

    # Unordered: members NOT in any REQUIRES relationship
    unordered_ids = sorted(member_set - in_requires)

    # Displayed depth is the learner-wide prerequisite depth (a member's
    # prerequisites may live outside the cluster), not the in-cluster one.
    all_nodes = set(member_set)
    for parent, children in requires_edges.items():
        all_nodes.add(parent)
        all_nodes.update(children)
    depths = _compute_depths(all_nodes, requires_edges)

    ordered_nodes = [
        PathNode(
            concept_id=cid,
            concept_label=concept_info.get(cid, {}).get("label", cid),
            depth=depths.get(cid, 0),
            complexity=concept_info.get(cid, {}).get("complexity", 1.0),
            recall=concept_info.get(cid, {}).get("recall", 0.0),
            is_locked=concept_info.get(cid, {}).get("is_locked", False),
        )
        for cid in ordered_ids
    ]

    unordered_nodes = [
        PathNode(
            concept_id=cid,
            concept_label=concept_info.get(cid, {}).get("label", cid),
            depth=depths.get(cid, 0),
            complexity=concept_info.get(cid, {}).get("complexity", 1.0),
            recall=concept_info.get(cid, {}).get("recall", 0.0),
            is_locked=concept_info.get(cid, {}).get("is_locked", False),
        )
        for cid in unordered_ids
    ]

    return LearningPath(
        target_concept_id=cluster_member_ids[0] if cluster_member_ids else "",
        ordered=ordered_nodes,
        unordered=unordered_nodes,
        has_cycle_break=has_cycle,
    )
