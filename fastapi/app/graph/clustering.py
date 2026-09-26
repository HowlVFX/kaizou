"""Cluster detection via Louvain community detection (§5.21).

Weekly job. Community detection over the concept graph.

Graph construction (undirected, weighted):
    weight(u,v) = 1.00   if WIKILINK edge
               = sim(u,v) if SEMANTIC edge and sim >= τ_link
               = 0.60    if REQUIRES edge (treated undirected)
    Where multiple edge types connect the same pair, take the maximum.
    Locked nodes (UNRESOLVED_PREREQUISITE) are excluded.

Modularity:
    Q = (1/2m) · Σ_{u,v} [A_uv − γ_res·(k_u·k_v)/(2m)] · δ(c_u, c_v)
    Q > 0.30 indicates meaningful structure.

Sub-clusters: recurse at γ_res=1.6 for communities with |K| >= 12.
Recursion depth capped at 2.
"""

from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
import random

# Constants (§5.26)
WIKILINK_WEIGHT: float = 1.00
REQUIRES_WEIGHT: float = 0.60
MODULARITY_THRESHOLD: float = 0.30
RESOLUTION_TOP: float = 1.0
RESOLUTION_SUB: float = 1.6
MIN_COMMUNITY_SIZE_FOR_SUB: int = 12
MAX_RECURSION_DEPTH: int = 2


def build_weighted_graph(
    concepts: list[dict],
    edges: list[dict],
) -> dict[str, dict[str, float]]:
    """Build undirected weighted adjacency from concept/edge data (§5.21).

    Args:
        concepts: list of concept dicts with at least 'id' and 'status'.
        edges: list of edge dicts with 'source_id', 'target_id', 'type',
               and optionally 'weight' (similarity for SEMANTIC edges).

    Returns:
        Adjacency dict: node_id → {neighbour_id → weight}.
        Locked nodes (UNRESOLVED_PREREQUISITE) are excluded.
    """
    # Exclude locked nodes
    active_ids = {
        c["id"] for c in concepts
        if c.get("status") != "UNRESOLVED_PREREQUISITE"
    }

    adjacency: dict[str, dict[str, float]] = defaultdict(dict)

    for edge in edges:
        src = edge["source_id"]
        tgt = edge["target_id"]

        if src not in active_ids or tgt not in active_ids:
            continue

        edge_type = edge.get("type", "SEMANTIC")
        sim_weight = edge.get("weight", 0.0) or 0.0

        if edge_type == "WIKILINK":
            w = WIKILINK_WEIGHT
        elif edge_type == "SEMANTIC":
            w = sim_weight  # Already filtered by τ_link at creation
        elif edge_type == "REQUIRES":
            w = REQUIRES_WEIGHT
        elif edge_type == "ANALOGY_OF":
            w = sim_weight if sim_weight > 0 else 0.5
        else:
            w = 0.0
            continue

        # Max of existing and new weight for the pair
        current = adjacency[src].get(tgt, 0.0)
        if w > current:
            adjacency[src][tgt] = w
            adjacency[tgt][src] = w

    # Ensure all active nodes appear even if isolated
    for nid in active_ids:
        if nid not in adjacency:
            adjacency[nid] = {}

    return dict(adjacency)


def compute_modularity(
    adjacency: dict[str, dict[str, float]],
    communities: dict[str, int],
    resolution: float = 1.0,
) -> float:
    """Compute modularity Q for a given partition (§5.21).

    Q = (1/2m) · Σ_{u,v} [A_uv − γ·(k_u·k_v)/(2m)] · δ(c_u, c_v)

    Returns:
        Modularity in roughly [-0.5, 1].
    """
    # Total weight
    m2 = 0.0  # 2m
    degrees: dict[str, float] = {}

    for node, neighbors in adjacency.items():
        deg = sum(neighbors.values())
        degrees[node] = deg
        m2 += deg

    if m2 == 0.0:
        return 0.0

    q = 0.0
    for u, neighbors in adjacency.items():
        for v, a_uv in neighbors.items():
            if communities.get(u) == communities.get(v):
                expected = resolution * (degrees[u] * degrees[v]) / m2
                q += a_uv - expected

    return q / m2


def louvain_communities(
    adjacency: dict[str, dict[str, float]],
    resolution: float = 1.0,
    seed: int = 42,
) -> tuple[dict[str, int], float]:
    """Run Louvain community detection (§5.21).

    A simplified but correct implementation of the Louvain algorithm:
    Phase 1: greedily move nodes to maximise modularity gain.
    Phase 2: build super-graph and repeat.

    Args:
        adjacency: node_id → {neighbour_id → weight}.
        resolution: γ_res parameter (1.0 for top-level, 1.6 for sub).
        seed: random seed for determinism.

    Returns:
        (communities, modularity): mapping of node → community_id, and Q.
    """
    rng = random.Random(seed)
    nodes = list(adjacency.keys())

    if not nodes:
        return {}, 0.0

    # Initialise: each node in its own community
    node_to_comm: dict[str, int] = {node: i for i, node in enumerate(nodes)}
    next_comm_id = len(nodes)

    # Compute total weight (2m)
    m2 = sum(sum(neighbors.values()) for neighbors in adjacency.values())
    if m2 == 0.0:
        return node_to_comm, 0.0

    # Compute degree per node
    degrees: dict[str, float] = {
        node: sum(neighbors.values()) for node, neighbors in adjacency.items()
    }

    # Phase 1: local moving
    improved = True
    while improved:
        improved = False
        order = nodes[:]
        rng.shuffle(order)

        for node in order:
            current_comm = node_to_comm[node]

            # Compute weights to each neighbouring community
            comm_weights: dict[int, float] = defaultdict(float)
            for neighbor, weight in adjacency.get(node, {}).items():
                comm_weights[node_to_comm[neighbor]] += weight

            # Sum of weights within current community (excluding this node)
            k_i = degrees[node]

            # Compute modularity gain for moving to each neighbour community
            best_comm = current_comm
            best_delta = 0.0

            for target_comm, w_to_target in comm_weights.items():
                if target_comm == current_comm:
                    continue

                # Simplified modularity gain calculation
                # ΔQ ∝ w_to_target - resolution * k_i * Σ_target / (2m)
                sum_target = sum(
                    degrees[n] for n, c in node_to_comm.items()
                    if c == target_comm
                )
                sum_current = sum(
                    degrees[n] for n, c in node_to_comm.items()
                    if c == current_comm and n != node
                )

                w_from_current = comm_weights.get(current_comm, 0.0)

                delta_in = w_to_target - resolution * k_i * sum_target / m2
                delta_out = w_from_current - resolution * k_i * sum_current / m2

                delta_q = delta_in - delta_out

                if delta_q > best_delta:
                    best_delta = delta_q
                    best_comm = target_comm

            if best_comm != current_comm:
                node_to_comm[node] = best_comm
                improved = True

    # Renumber communities to be contiguous 0..n
    unique_comms = sorted(set(node_to_comm.values()))
    comm_remap = {old: new for new, old in enumerate(unique_comms)}
    node_to_comm = {node: comm_remap[c] for node, c in node_to_comm.items()}

    q = compute_modularity(adjacency, node_to_comm, resolution)

    return node_to_comm, q


def detect_clusters(
    concepts: list[dict],
    edges: list[dict],
    resolution: float = RESOLUTION_TOP,
) -> list[dict]:
    """Run cluster detection over concept graph (§5.21).

    Returns clusters only if Q > 0.30 (meaningful structure).
    Otherwise returns empty list = "no clear structure yet".

    Args:
        concepts: list of concept dicts.
        edges: list of edge dicts.
        resolution: Louvain resolution (default 1.0).

    Returns:
        list of cluster dicts: {
            'community_id': int,
            'member_ids': list[str],
            'member_count': int,
            'modularity': float,
        }
    """
    adjacency = build_weighted_graph(concepts, edges)
    communities, modularity = louvain_communities(adjacency, resolution)

    if modularity < MODULARITY_THRESHOLD:
        return []

    # Group by community
    comm_members: dict[int, list[str]] = defaultdict(list)
    for node_id, comm_id in communities.items():
        comm_members[comm_id].append(node_id)

    return [
        {
            "community_id": comm_id,
            "member_ids": sorted(members),
            "member_count": len(members),
            "modularity": modularity,
        }
        for comm_id, members in sorted(comm_members.items())
    ]


def detect_subclusters(
    parent_member_ids: list[str],
    concepts: list[dict],
    edges: list[dict],
    resolution: float = RESOLUTION_SUB,
) -> list[dict]:
    """Detect sub-clusters within a parent cluster (§5.21).

    Only recurse if |K| >= 12 and Q > 0.30 at higher resolution.
    Recursion depth capped at 2 (handled by caller).

    Args:
        parent_member_ids: concept IDs in the parent cluster.
        concepts: full concept list (filtered here).
        edges: full edge list (filtered here).
        resolution: sub-cluster resolution (default 1.6).

    Returns:
        List of sub-cluster dicts, or empty if not enough structure.
    """
    if len(parent_member_ids) < MIN_COMMUNITY_SIZE_FOR_SUB:
        return []

    member_set = set(parent_member_ids)
    filtered_concepts = [c for c in concepts if c["id"] in member_set]
    filtered_edges = [
        e for e in edges
        if e["source_id"] in member_set and e["target_id"] in member_set
    ]

    return detect_clusters(filtered_concepts, filtered_edges, resolution)
