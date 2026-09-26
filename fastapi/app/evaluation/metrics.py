"""Evaluation metrics (§5.25, §14).

All metrics for validating the system's grading, memory, and retrieval:

Grading agreement:    Cohen's kappa (κ) — target ≥ 0.61
Memory calibration:   Brier score, ECE, AUC
Probe discrimination: Point-biserial correlation (r_pb)
Retrieval quality:    Precision@k, Recall, MRR
Generation:           Inter-run agreement
"""

from __future__ import annotations

import math
from typing import Optional


# ---------------------------------------------------------------------------
# §5.25.1  Cohen's Kappa — grading agreement
# ---------------------------------------------------------------------------

def calculate_cohens_kappa(
    predicted: list[str],
    actual: list[str],
) -> float:
    """Compute Cohen's κ for inter-rater agreement.

    κ = (p_o − p_e) / (1 − p_e)

    where p_o = observed agreement, p_e = expected agreement by chance.

    Target: κ ≥ 0.61 (substantial agreement on ~200 hand-labelled attempts).

    Args:
        predicted: predicted band labels (e.g., "Full", "Shallow", ...).
        actual: ground-truth band labels.

    Returns:
        κ in [-1, 1]. 1 = perfect agreement, 0 = chance.
    """
    if len(predicted) != len(actual):
        raise ValueError("Lists must have equal length")

    n = len(predicted)
    if n == 0:
        return 0.0

    # Build confusion matrix categories
    categories = sorted(set(predicted) | set(actual))
    cat_to_idx = {c: i for i, c in enumerate(categories)}
    k = len(categories)

    # Confusion matrix
    matrix = [[0] * k for _ in range(k)]
    for p, a in zip(predicted, actual):
        matrix[cat_to_idx[p]][cat_to_idx[a]] += 1

    # Observed agreement
    p_o = sum(matrix[i][i] for i in range(k)) / n

    # Expected agreement by chance
    p_e = 0.0
    for i in range(k):
        row_sum = sum(matrix[i][j] for j in range(k))  # predicted as i
        col_sum = sum(matrix[j][i] for j in range(k))  # actually i
        p_e += (row_sum * col_sum) / (n * n)

    if p_e >= 1.0:
        return 1.0 if p_o >= 1.0 else 0.0

    return (p_o - p_e) / (1.0 - p_e)


# ---------------------------------------------------------------------------
# §5.25.2  Memory calibration
# ---------------------------------------------------------------------------

def calculate_brier_score(
    predicted_probs: list[float],
    outcomes: list[bool],
) -> float:
    """Compute Brier score for probability calibration.

    Brier = (1/n) · Σ(R_i − o_i)²

    where R_i is predicted recall probability and o_i ∈ {0, 1} is
    whether the learner actually passed. Lower is better.

    Args:
        predicted_probs: predicted recall probabilities R.
        outcomes: True if the learner passed, False otherwise.

    Returns:
        Brier score in [0, 1].
    """
    if len(predicted_probs) != len(outcomes):
        raise ValueError("Lists must have equal length")

    n = len(predicted_probs)
    if n == 0:
        return 0.0

    total = sum(
        (p - (1.0 if o else 0.0)) ** 2
        for p, o in zip(predicted_probs, outcomes)
    )
    return total / n


def calculate_ece(
    predicted_probs: list[float],
    outcomes: list[bool],
    n_bins: int = 10,
) -> float:
    """Compute Expected Calibration Error.

    ECE = Σ_b (|B_b|/n) · |accuracy(B_b) − confidence(B_b)|

    Measures how well predicted probabilities match observed frequencies
    across equal-width bins. Lower is better.

    Args:
        predicted_probs: predicted probabilities.
        outcomes: actual binary outcomes.
        n_bins: number of equal-width bins (default 10).

    Returns:
        ECE in [0, 1].
    """
    if len(predicted_probs) != len(outcomes):
        raise ValueError("Lists must have equal length")

    n = len(predicted_probs)
    if n == 0:
        return 0.0

    # Build bins
    bin_edges = [i / n_bins for i in range(n_bins + 1)]
    ece = 0.0

    for b in range(n_bins):
        lo = bin_edges[b]
        hi = bin_edges[b + 1]

        # Collect items in this bin
        bin_items = [
            (p, o)
            for p, o in zip(predicted_probs, outcomes)
            if lo <= p < hi or (b == n_bins - 1 and p == hi)
        ]

        if not bin_items:
            continue

        bin_size = len(bin_items)
        avg_confidence = sum(p for p, _ in bin_items) / bin_size
        avg_accuracy = sum(1.0 if o else 0.0 for _, o in bin_items) / bin_size

        ece += (bin_size / n) * abs(avg_accuracy - avg_confidence)

    return ece


def calculate_auc(
    scores_positive: list[float],
    scores_negative: list[float],
) -> float:
    """Compute AUC via Mann-Whitney U statistic.

    AUC = U / (n_pos · n_neg)

    where U = number of (positive, negative) pairs where the positive
    score is higher. Measures discrimination ability.

    Args:
        scores_positive: predicted R values for successful attempts.
        scores_negative: predicted R values for failed attempts.

    Returns:
        AUC in [0, 1]. 0.5 = random, 1.0 = perfect discrimination.
    """
    n_pos = len(scores_positive)
    n_neg = len(scores_negative)

    if n_pos == 0 or n_neg == 0:
        return 0.5  # undefined, return chance

    u = 0.0
    for p in scores_positive:
        for n in scores_negative:
            if p > n:
                u += 1.0
            elif p == n:
                u += 0.5

    return u / (n_pos * n_neg)


# ---------------------------------------------------------------------------
# §5.16  Probe discrimination — Point-biserial correlation
# ---------------------------------------------------------------------------

def calculate_point_biserial(
    binary_outcomes: list[bool],
    continuous_scores: list[float],
) -> float:
    """Compute point-biserial correlation r_pb (§5.16).

    r_pb = ((M_1 − M_0) / s_n) · sqrt(p · q)

    where M_1 = mean score of passers, M_0 = mean score of failers,
    s_n = population std dev, p = proportion passing, q = 1 − p.

    Discrimination bands (§5.16):
        r_pb >= 0.30:  acceptable
        0.15–0.30:     weak, flag for review
        < 0.15:        not discriminating, retire
        < 0:           inverted defect (strong learners fail it)

    Requires cohort N >= 5 (D-10 privacy floor).

    Args:
        binary_outcomes: True = passed this probe, False = failed.
        continuous_scores: performance on OTHER concept probes.

    Returns:
        r_pb correlation coefficient.
    """
    if len(binary_outcomes) != len(continuous_scores):
        raise ValueError("Lists must have equal length")

    n = len(binary_outcomes)
    if n < 2:
        return 0.0

    # Split into two groups
    scores_pass = [s for o, s in zip(binary_outcomes, continuous_scores) if o]
    scores_fail = [s for o, s in zip(binary_outcomes, continuous_scores) if not o]

    if not scores_pass or not scores_fail:
        return 0.0

    m_1 = sum(scores_pass) / len(scores_pass)
    m_0 = sum(scores_fail) / len(scores_fail)

    # Population standard deviation of all scores
    mean_all = sum(continuous_scores) / n
    variance = sum((s - mean_all) ** 2 for s in continuous_scores) / n

    if variance == 0.0:
        return 0.0

    s_n = math.sqrt(variance)

    p = len(scores_pass) / n
    q = 1.0 - p

    return ((m_1 - m_0) / s_n) * math.sqrt(p * q)


def classify_probe_discrimination(r_pb: float) -> str:
    """Classify probe discrimination band (§5.16).

    >= 0.30:   acceptable
    0.15–0.30: weak
    0–0.15:    retire (not discriminating)
    < 0:       inverted_defect
    """
    if r_pb >= 0.30:
        return "acceptable"
    elif r_pb >= 0.15:
        return "weak"
    elif r_pb >= 0.0:
        return "retire"
    else:
        return "inverted_defect"


# ---------------------------------------------------------------------------
# §5.25.3  Retrieval / link quality
# ---------------------------------------------------------------------------

def calculate_precision_at_k(
    results: list[bool],
    k: int,
) -> float:
    """Compute Precision@k — fraction of top-k results that are relevant.

    Args:
        results: ordered list of relevance judgments (True/False).
        k: cutoff.

    Returns:
        Precision@k in [0, 1].
    """
    if k <= 0:
        return 0.0

    top_k = results[:k]
    if not top_k:
        return 0.0

    return sum(1 for r in top_k if r) / len(top_k)


def calculate_recall(
    true_positives: int,
    false_negatives: int,
) -> float:
    """Compute recall = TP / (TP + FN).

    Returns 0.0 if TP + FN = 0.
    """
    total = true_positives + false_negatives
    if total == 0:
        return 0.0
    return true_positives / total


def calculate_mrr(
    ranked_queries: list[list[bool]],
) -> float:
    """Compute Mean Reciprocal Rank.

    MRR = (1/|Q|) · Σ_q (1 / rank_q)

    where rank_q is the position of the first relevant result for query q.

    Args:
        ranked_queries: list of queries, each a list of relevance judgments.

    Returns:
        MRR in [0, 1].
    """
    if not ranked_queries:
        return 0.0

    rr_sum = 0.0
    for results in ranked_queries:
        for rank, is_relevant in enumerate(results, 1):
            if is_relevant:
                rr_sum += 1.0 / rank
                break
        # If no relevant result found, contributes 0

    return rr_sum / len(ranked_queries)


# ---------------------------------------------------------------------------
# §5.25.4  Generation agreement
# ---------------------------------------------------------------------------

def calculate_generation_agreement(
    claims_run_a: list[str],
    claims_run_b: list[str],
    embeddings_a: list[list[float]],
    embeddings_b: list[list[float]],
    threshold: float = 0.82,
) -> float:
    """Compute inter-run agreement between two pipeline generations.

    Measures whether running the extraction pipeline twice produces
    consistent claim sets. Uses bidirectional claim matching at threshold τ.

    Agreement = (matched_a_in_b + matched_b_in_a) / (|A| + |B|)

    Args:
        claims_run_a: claims from first generation run.
        claims_run_b: claims from second generation run.
        embeddings_a: embeddings for run A claims.
        embeddings_b: embeddings for run B claims.
        threshold: matching threshold (default 0.82).

    Returns:
        Agreement rate in [0, 1]. 1.0 = identical output.
    """
    from app.grading.coverage import build_similarity_matrix, match_claims

    if not claims_run_a and not claims_run_b:
        return 1.0  # Both empty = perfect agreement
    if not claims_run_a or not claims_run_b:
        return 0.0  # One empty = no agreement

    # A → B matching
    matrix_ab = build_similarity_matrix(embeddings_a, embeddings_b)
    matched_a, _, _ = match_claims(matrix_ab, threshold)

    # B → A matching
    matrix_ba = build_similarity_matrix(embeddings_b, embeddings_a)
    matched_b, _, _ = match_claims(matrix_ba, threshold)

    matched_count = sum(1 for m in matched_a if m) + sum(1 for m in matched_b if m)
    total = len(claims_run_a) + len(claims_run_b)

    return matched_count / total
