"""Claim matching and coverage calculation (§5.1–5.3).

Core grading pipeline:
  1. Build similarity matrix M[i][j] between required claims and learner claims
  2. Determine which required claims are matched (forward) and which learner
     claims are supported (reverse) via greedy-max against threshold τ = 0.82
  3. Compute weighted coverage = Σ(w_i · matched(c_i)) / Σ(w_i)

Design decisions:
  - Greedy-max matching (not bipartite): a single concise learner sentence may
    satisfy multiple required claims. Hungarian matching was explicitly rejected
    because it punishes concise correct answers (§5.2).
  - Alias table: exact string match short-circuits to sim = 1.0 (§5.2).
  - Exact k-NN only — no HNSW/IVFFlat (§5.1, D-03).
"""

from __future__ import annotations

import math
from typing import Optional


# ---------------------------------------------------------------------------
# §5.1  Cosine similarity
# ---------------------------------------------------------------------------

def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors.

    sim(a, b) = (v_a · v_b) / (||v_a|| · ||v_b||)

    Returns 0.0 if either vector has zero magnitude.
    """
    if len(vec_a) != len(vec_b):
        raise ValueError(
            f"Vector dimension mismatch: {len(vec_a)} vs {len(vec_b)}"
        )

    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0

    for a, b in zip(vec_a, vec_b):
        dot += a * b
        norm_a += a * a
        norm_b += b * b

    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


# ---------------------------------------------------------------------------
# §5.2  Claim matching — greedy max
# ---------------------------------------------------------------------------

def build_similarity_matrix(
    embeddings_required: list[list[float]],
    embeddings_learner: list[list[float]],
    alias_table: Optional[dict[int, list[str]]] = None,
    learner_texts: Optional[list[str]] = None,
) -> list[list[float]]:
    """Build the full n×m similarity matrix M[i][j] = sim(c_i, s_j).

    If an alias table is provided (mapping required-claim index → list of
    known surface forms), and learner_texts is also provided, any exact
    case-insensitive alias hit short-circuits to sim = 1.0 (§5.2).

    Cost: O(n·m) similarity evaluations after n+m embeddings.
    """
    n = len(embeddings_required)
    m = len(embeddings_learner)

    # Pre-normalise alias lookup
    alias_lookup: dict[int, set[str]] = {}
    if alias_table and learner_texts:
        for idx, aliases in alias_table.items():
            alias_lookup[idx] = {a.lower().strip() for a in aliases}

    matrix: list[list[float]] = []
    for i in range(n):
        row: list[float] = []
        for j in range(m):
            # Alias short-circuit: exact match → 1.0
            if i in alias_lookup and learner_texts:
                learner_lower = learner_texts[j].lower().strip()
                if learner_lower in alias_lookup[i]:
                    row.append(1.0)
                    continue

            row.append(cosine_similarity(embeddings_required[i],
                                         embeddings_learner[j]))
        matrix.append(row)

    return matrix


def match_claims(
    similarity_matrix: list[list[float]],
    threshold: float = 0.82,
) -> tuple[
    list[bool],                     # matched_required[i]
    list[bool],                     # supported_learner[j]
    list[tuple[int, int, float]],   # match_pairs (i, j, sim)
]:
    """Evaluate claim matching from the similarity matrix.

    Forward (§5.2): matched(c_i) = 𝟙(max_j M[i][j] >= τ)
    Reverse (§5.2): supported(s_j) = 𝟙(max_i M[i][j] >= τ)

    Returns:
        matched_required: bool per required claim — is it covered?
        supported_learner: bool per learner claim — is it supported?
        match_pairs: list of (required_idx, learner_idx, similarity) for
                     each matched required claim and its best learner match.
    """
    if not similarity_matrix:
        return [], [], []

    n = len(similarity_matrix)
    m = len(similarity_matrix[0]) if similarity_matrix else 0

    matched_required: list[bool] = []
    match_pairs: list[tuple[int, int, float]] = []

    for i in range(n):
        best_j = -1
        best_sim = -1.0
        for j in range(m):
            if similarity_matrix[i][j] > best_sim:
                best_sim = similarity_matrix[i][j]
                best_j = j

        is_matched = best_sim >= threshold
        matched_required.append(is_matched)
        if is_matched and best_j >= 0:
            match_pairs.append((i, best_j, best_sim))

    # Reverse: is learner claim j supported by any required claim?
    supported_learner: list[bool] = []
    for j in range(m):
        best_i_sim = max(
            (similarity_matrix[i][j] for i in range(n)),
            default=-1.0,
        )
        supported_learner.append(best_i_sim >= threshold)

    return matched_required, supported_learner, match_pairs


# ---------------------------------------------------------------------------
# §5.3  Claim weights
# ---------------------------------------------------------------------------

def calculate_claim_weight(
    is_transition: bool,
    is_load_bearing: bool,
    base_weight: float = 1.0,
) -> float:
    """Compute the weight for a single claim.

    w_i = w_base · m_transition · m_role

    m_transition = 1.5 if the claim encodes a state transition / causal step
    m_role       = 1.25 if the claim is load-bearing (perturbation delta)
    """
    weight = base_weight
    if is_transition:
        weight *= 1.5
    if is_load_bearing:
        weight *= 1.25
    return weight


def calculate_coverage(
    matched_claims: list[bool],
    weights: list[float],
) -> float:
    """Compute weighted coverage.

    coverage = Σ(w_i · matched(c_i)) / Σ(w_i)

    Returns 0.0 if total weight is zero (should not happen for probe-eligible
    concepts — a concept with zero claims is not probe-eligible, §5.3).
    """
    if len(matched_claims) != len(weights):
        raise ValueError(
            f"Length mismatch: {len(matched_claims)} matched vs "
            f"{len(weights)} weights"
        )

    total_weight = sum(weights)
    if total_weight == 0.0:
        return 0.0

    matched_weight = sum(
        w for matched, w in zip(matched_claims, weights) if matched
    )

    return matched_weight / total_weight