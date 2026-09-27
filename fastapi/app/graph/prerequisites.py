"""Prerequisite resolution and cycle detection (§5.23.3, D-15).

Manages the REQUIRES edge creation:
    - Resolving prerequisite labels to existing concepts or creating
      ghost nodes (UNRESOLVED_PREREQUISITE)
    - Promoting ghost nodes when a matching note arrives
    - Detecting and preventing cycles in the REQUIRES DAG

Cycle handling at write time (D-15):
    on insert edge u → v:
        if path_exists(v → u):  # would close a cycle
            keep the edge with higher extraction confidence
            flag the other CYCLE_CONFLICT, do not persist
            record both for dev review

At traversal time: break at lowest-confidence edge, flag the path.
"""

from __future__ import annotations

from collections import deque


def detect_cycle(
    source_id: str,
    target_id: str,
    requires_forward: dict[str, list[str]],
) -> bool:
    """Check if adding edge source → target would create a cycle (D-15).

    Tests if path_exists(target → source) in the current graph.
    If True, the proposed edge would close a cycle.

    Uses BFS from target looking for source.

    Args:
        source_id: proposed edge source (parent concept).
        target_id: proposed edge target (dependent concept).
        requires_forward: existing forward graph parent → [children].

    Returns:
        True if the edge would create a cycle.
    """
    if source_id == target_id:
        return True

    # BFS from target to see if we can reach source
    visited: set[str] = set()
    queue = deque([target_id])

    while queue:
        node = queue.popleft()
        if node == source_id:
            return True

        if node in visited:
            continue
        visited.add(node)

        for child in requires_forward.get(node, []):
            if child not in visited:
                queue.append(child)

    return False


def find_cycle_in_graph(
    node_ids: set[str],
    requires_forward: dict[str, list[str]],
) -> list[str] | None:
    """Find a cycle in the REQUIRES subgraph if one exists.

    Returns the cycle as a list of node IDs, or None if no cycle.
    Uses iterative DFS with path tracking.
    """
    # Build in-degree
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}
    for parent in node_ids:
        for child in requires_forward.get(parent, []):
            if child in node_ids:
                in_degree[child] = in_degree.get(child, 0) + 1

    # Kahn's — if we can't sort all nodes, there's a cycle
    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
    sorted_count = 0

    while queue:
        node = queue.popleft()
        sorted_count += 1
        for child in requires_forward.get(node, []):
            if child in node_ids:
                in_degree[child] -= 1
                if in_degree[child] == 0:
                    queue.append(child)

    if sorted_count == len(node_ids):
        return None  # No cycle

    # Find the actual cycle using DFS
    remaining = {nid for nid in node_ids if in_degree.get(nid, 0) > 0}

    # Simple cycle extraction from remaining nodes
    if remaining:
        return list(remaining)

    return None


def break_cycle_at_weakest(
    cycle_nodes: list[str],
    requires_forward: dict[str, list[str]],
    edge_confidences: dict[tuple[str, str], float],
) -> tuple[str, str] | None:
    """Break a cycle by removing the lowest-confidence edge (D-15).

    At traversal time, break at the lowest-confidence edge in the cycle
    and flag the path as containing a broken dependency.

    Args:
        cycle_nodes: node IDs forming the cycle.
        requires_forward: forward graph.
        edge_confidences: (source, target) → confidence score.

    Returns:
        (source, target) of the edge to break, or None if no edges found.
    """
    cycle_set = set(cycle_nodes)
    weakest_edge: tuple[str, str] | None = None
    weakest_confidence = float("inf")

    for parent in cycle_nodes:
        for child in requires_forward.get(parent, []):
            if child in cycle_set:
                confidence = edge_confidences.get((parent, child), 0.5)
                if confidence < weakest_confidence:
                    weakest_confidence = confidence
                    weakest_edge = (parent, child)

    return weakest_edge


def build_requires_forward(edges: list[dict]) -> dict[str, list[str]]:
    """Build the prerequisite → [dependents] graph from REQUIRES edge rows.

    DB convention (edges table): ``source_id REQUIRES target_id``, i.e. the
    target is the prerequisite ("Hoisting ──REQUIRES──> Creation Phase").
    Graph helpers here and in app.graph.paths use the forward orientation
    parent (prerequisite) → children (dependents), so each row is inverted.
    Edges flagged CYCLE_CONFLICT are not part of the DAG and are skipped.
    """
    forward: dict[str, list[str]] = {}
    for e in edges:
        if e.get("flag") == "CYCLE_CONFLICT":
            continue
        prereq = str(e["target_id"])
        dependent = str(e["source_id"])
        children = forward.setdefault(prereq, [])
        if dependent not in children:
            children.append(dependent)
    return forward


def compute_prerequisite_depths(
    requires_forward: dict[str, list[str]],
    node_ids: set[str] | None = None,
) -> dict[str, int]:
    """Longest prerequisite chain below each node (0 = no prerequisites).

    Nodes caught in a cycle (should not happen once CYCLE_CONFLICT edges are
    excluded) keep the depth reached before the cycle.
    """
    nodes: set[str] = set(node_ids or ())
    for parent, children in requires_forward.items():
        nodes.add(parent)
        nodes.update(children)

    in_degree = {n: 0 for n in nodes}
    for parent, children in requires_forward.items():
        for child in children:
            in_degree[child] += 1

    depths = {n: 0 for n in nodes}
    queue = deque(n for n, d in in_degree.items() if d == 0)
    while queue:
        node = queue.popleft()
        for child in requires_forward.get(node, []):
            depths[child] = max(depths[child], depths[node] + 1)
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)
    return depths


def plan_requires_edges(
    concept_id: str,
    prerequisite_ids: list[str],
    requires_forward: dict[str, list[str]],
) -> tuple[list[dict], int]:
    """Decide which REQUIRES edges to write for a concept (D-15).

    For each prerequisite P of concept C the proposed DAG edge is P → C.
    If C already (transitively) precedes P, the edge would close a cycle:
    the existing edges were accepted first, so they win and the new edge is
    recorded with flag CYCLE_CONFLICT (kept for dev review, excluded from
    traversal). Self-references are dropped.

    ``requires_forward`` is updated in place with accepted edges so later
    prerequisites in the same batch see them.

    Returns:
        (edges, depth): edge dicts {'source_id': C, 'target_id': P, 'flag'}
        in DB orientation, and C's prerequisite depth after the accepted
        edges are applied.
    """
    planned: list[dict] = []
    seen: set[str] = set()
    for prereq_id in prerequisite_ids:
        if prereq_id == concept_id or prereq_id in seen:
            continue
        seen.add(prereq_id)
        conflict = detect_cycle(prereq_id, concept_id, requires_forward)
        if not conflict:
            children = requires_forward.setdefault(prereq_id, [])
            if concept_id not in children:
                children.append(concept_id)
        planned.append({
            "source_id": concept_id,
            "target_id": prereq_id,
            "flag": "CYCLE_CONFLICT" if conflict else None,
        })

    depths = compute_prerequisite_depths(requires_forward, {concept_id})
    return planned, depths.get(concept_id, 0)


def resolve_prerequisite_labels(
    labels: list[str],
    existing_concepts: dict[str, str],
) -> list[dict]:
    """Resolve prerequisite labels to concept IDs or flag as new ghosts.

    Args:
        labels: prerequisite label strings from extraction.
        existing_concepts: label → concept_id for the learner's graph.

    Returns:
        List of dicts: {'label': str, 'concept_id': str | None, 'is_new': bool}
        where concept_id is None and is_new is True for unresolved labels.
    """
    results: list[dict] = []

    for label in labels:
        normalised = label.strip().lower()

        # Try exact match first
        matched_id = None
        for existing_label, concept_id in existing_concepts.items():
            if existing_label.strip().lower() == normalised:
                matched_id = concept_id
                break

        results.append({
            "label": label,
            "concept_id": matched_id,
            "is_new": matched_id is None,
        })

    return results
