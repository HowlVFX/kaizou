"""Smoke tests for the deterministic grading and memory modules.

Validates the math against the master design document's formulas and
worked examples.
"""

import sys
import math
sys.path.insert(0, '.')

from datetime import datetime, timezone, timedelta


def test_cosine_similarity():
    from app.grading.coverage import cosine_similarity

    # Identical vectors → 1.0
    assert abs(cosine_similarity([1, 0, 0], [1, 0, 0]) - 1.0) < 1e-9
    # Orthogonal vectors → 0.0
    assert abs(cosine_similarity([1, 0, 0], [0, 1, 0]) - 0.0) < 1e-9
    # Opposite vectors → -1.0
    assert abs(cosine_similarity([1, 0], [-1, 0]) - (-1.0)) < 1e-9
    # Known values
    a, b = [1, 2, 3], [4, 5, 6]
    expected = (4+10+18) / (math.sqrt(14) * math.sqrt(77))
    assert abs(cosine_similarity(a, b) - expected) < 1e-9
    # Zero vector → 0.0
    assert cosine_similarity([0, 0], [1, 1]) == 0.0
    print("  ✓ cosine_similarity")


def test_claim_weight():
    from app.grading.coverage import calculate_claim_weight

    assert calculate_claim_weight(False, False) == 1.0
    assert abs(calculate_claim_weight(True, False) - 1.5) < 1e-9
    assert abs(calculate_claim_weight(False, True) - 1.25) < 1e-9
    assert abs(calculate_claim_weight(True, True) - 1.875) < 1e-9  # 1.5 * 1.25
    print("  ✓ calculate_claim_weight  (1.0, 1.5, 1.25, 1.875)")


def test_coverage():
    from app.grading.coverage import calculate_coverage

    # All matched, equal weights
    assert calculate_coverage([True, True, True], [1.0, 1.0, 1.0]) == 1.0
    # None matched
    assert calculate_coverage([False, False], [1.0, 1.0]) == 0.0
    # Weighted: match the heavy one
    cov = calculate_coverage([True, False], [1.5, 1.0])
    assert abs(cov - 1.5/2.5) < 1e-9
    print("  ✓ calculate_coverage")


def test_claim_matching():
    from app.grading.coverage import match_claims

    # Perfect match: both above threshold
    matrix = [[0.95, 0.1], [0.2, 0.90]]
    matched_req, supported_learn, pairs = match_claims(matrix, threshold=0.82)
    assert matched_req == [True, True]
    assert supported_learn == [True, True]
    assert len(pairs) == 2
    # Below threshold
    matrix2 = [[0.70, 0.3], [0.4, 0.75]]
    matched2, supported2, pairs2 = match_claims(matrix2, threshold=0.82)
    assert matched2 == [False, False]
    assert supported2 == [False, False]
    assert len(pairs2) == 0
    print("  ✓ match_claims")


def test_precision():
    from app.grading.precision import calculate_precision

    assert calculate_precision([True, True, False], 3) == 2.0/3.0
    assert calculate_precision([], 0) == 0.0  # empty answer → 0
    assert calculate_precision([True, True], 2) == 1.0
    print("  ✓ calculate_precision")


def test_kendall_tau_b():
    from app.grading.ordering import calculate_kendall_tau_b, calculate_ordering_score

    # Perfect agreement
    tau = calculate_kendall_tau_b([1, 2, 3], [10, 20, 30])
    assert tau is not None
    assert abs(tau - 1.0) < 1e-9
    # Perfect disagreement
    tau2 = calculate_kendall_tau_b([1, 2, 3], [30, 20, 10])
    assert tau2 is not None
    assert abs(tau2 - (-1.0)) < 1e-9
    # k < 2 → None
    assert calculate_kendall_tau_b([1], [10]) is None
    # Rescale
    assert abs(calculate_ordering_score(1.0) - 1.0) < 1e-9
    assert abs(calculate_ordering_score(-1.0) - 0.0) < 1e-9
    assert abs(calculate_ordering_score(0.0) - 0.5) < 1e-9
    assert calculate_ordering_score(None) is None
    print("  ✓ calculate_kendall_tau_b + ordering_score")


def test_verbatim():
    from app.grading.verbatim import (
        longest_common_contiguous_subsequence,
        calculate_verbatim_ratio,
        calculate_verbatim_penalty,
    )

    # LCS
    lcs = longest_common_contiguous_subsequence(
        ["the", "cat", "sat", "on", "the", "mat"],
        ["the", "cat", "sat", "down"]
    )
    assert lcs == 3  # "the cat sat"

    # Verbatim ratio
    v = calculate_verbatim_ratio(
        ["a", "b", "c", "d", "e"],  # 5 tokens
        ["c", "d", "e", "f", "g"]   # LCS = 3 ("c d e")
    )
    assert abs(v - 3/5) < 1e-9

    # Penalty with dead zone
    assert calculate_verbatim_penalty(0.30) == 0.0  # below v_0=0.35
    assert calculate_verbatim_penalty(0.35) == 0.0  # at v_0
    assert abs(calculate_verbatim_penalty(1.0) - 1.0) < 1e-9  # pure copy
    # 0.675 → (0.675 - 0.35) / (1 - 0.35) = 0.325/0.65 = 0.5
    assert abs(calculate_verbatim_penalty(0.675) - 0.5) < 1e-9
    print("  ✓ verbatim (LCS, ratio, penalty)")


def test_composite():
    from app.grading.composite import (
        calculate_composite_score,
        classify_understanding_band,
        calculate_branch_leakage,
    )

    # Ordered: perfect scores
    score = calculate_composite_score(1.0, 1.0, 1.0, 0.0, 0.0)
    assert abs(score - 1.0) < 1e-9

    # Unordered (ordering=None): 0.647*1.0 + 0.353*1.0 = 1.0
    score2 = calculate_composite_score(1.0, 1.0, None, 0.0, 0.0)
    assert abs(score2 - 1.0) < 1e-9

    # With penalties: raw=0.55*1 + 0.15*0.5 + 0.30*0.8 = 0.55+0.075+0.24 = 0.865
    # penalty = 0.20*0.3 + 0.25*0.1 = 0.06 + 0.025 = 0.085
    # final = 0.865 - 0.085 = 0.78
    score3 = calculate_composite_score(1.0, 0.8, 0.5, 0.3, 0.1)
    assert abs(score3 - 0.78) < 1e-4

    # Band classification
    assert classify_understanding_band(0.90, True) == "Full"
    assert classify_understanding_band(0.90, False) == "Shallow"  # conjunction!
    assert classify_understanding_band(0.60, True) == "Shallow"
    assert classify_understanding_band(0.30, True) == "Incomplete"
    assert classify_understanding_band(0.10, True) == "Not_Yet_Engaged"

    # Branch leakage
    leakage = calculate_branch_leakage([True, False], [1.0, 1.0], [2.0, 2.0])
    assert abs(leakage - 1.0/4.0) < 1e-9
    print("  ✓ composite + bands + branch_leakage")


def test_gap_report():
    from app.grading.gap_report import GapReportBuilder

    builder = GapReportBuilder()
    report = builder.build(
        matched_claims=[True, False, False],
        answer_key_claims=["claim A", "claim B", "claim C"],
        weights=[1.0, 1.5, 1.25],
        is_transition=[False, True, False],
        is_load_bearing=[False, False, True],
        coverage=0.267,
        band="Incomplete",
    )
    assert report.total_required == 3
    assert report.total_matched == 1
    assert len(report.missing_claims) == 2
    # Sorted by weight desc: claim B (1.5) first, claim C (1.25) second
    assert report.missing_claims[0].claim_text == "claim B"
    assert report.missing_claims[0].is_transition is True
    assert report.missing_claims[1].claim_text == "claim C"
    assert report.missing_claims[1].is_load_bearing is True
    d = report.to_dict()
    assert d["coverage"] == 0.267
    print("  ✓ gap_report")


def test_recall_probability():
    from app.memory.decay import calculate_recall_probability

    now = datetime(2025, 1, 2, 0, 0, tzinfo=timezone.utc)
    last = datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc)

    # At exactly 1 half-life, R = 0.5
    r = calculate_recall_probability(last, 1.0, current_time=now)
    assert abs(r - 0.5) < 1e-9

    # At 0 elapsed, R = 1.0
    r2 = calculate_recall_probability(now, 1.0, current_time=now)
    assert abs(r2 - 1.0) < 1e-9

    # Decay exempt → 1.0
    r3 = calculate_recall_probability(last, 1.0, decay_exempt=True, current_time=now)
    assert r3 == 1.0
    print("  ✓ calculate_recall_probability  (R(h)=0.5, R(0)=1.0, exempt=1.0)")


def test_half_life_dynamics():
    from app.memory.decay import (
        calculate_initial_half_life,
        update_half_life,
        calculate_h_min,
    )

    # h_0 = 1/C
    assert abs(calculate_initial_half_life(0.5) - 2.0) < 1e-9   # trivial → 2 days
    assert abs(calculate_initial_half_life(1.0) - 1.0) < 1e-9
    assert abs(calculate_initial_half_life(2.0) - 0.5) < 1e-9   # dense → 12h

    # h_min = 0.5/C
    assert abs(calculate_h_min(1.0) - 0.5) < 1e-9

    # Success: h_new = h * (1 + (s/C) * e^(-λ*p))
    # At C=1.0, s=0.9, p=0.5, λ=1.5: h_new = 1.0 * (1 + 0.9 * e^(-0.75))
    # e^(-0.75) ≈ 0.4724
    h_new = update_half_life(1.0, 0.9, 0.5, 1.0)
    expected = 1.0 * (1.0 + 0.9 * math.exp(-0.75))
    assert abs(h_new - expected) < 1e-6
    assert abs(h_new - 1.425) < 0.01  # ≈1.42 from the worked trajectory

    # Failure: h_new = max(h_min, h * 0.5)
    h_fail = update_half_life(1.0, 0.3, 0.5, 1.0)  # score 0.3 < 0.5
    assert abs(h_fail - 0.5) < 1e-9  # 1.0 * 0.5 = 0.5 = h_min at C=1.0
    print("  ✓ half-life dynamics (init, success spacing, failure floor)")


def test_complexity():
    from app.memory.mastery import (
        compute_structural_complexity,
        compute_initial_complexity,
        update_observed_complexity,
    )

    # A typical concept: 6 claims, depth 2, 180 tokens → z ≈ 1.0
    c = compute_structural_complexity(6, 2, 180)
    assert abs(c - 1.0) < 1e-9

    # C_0 = 0.5*C_struct + 0.5*C_bloom
    c0 = compute_initial_complexity(1.0, 1.5)
    assert abs(c0 - 1.25) < 1e-9

    # Observed correction: not applied below 5 attempts
    c_same = update_observed_complexity(1.0, 0.7, 3)
    assert c_same == 1.0

    # Applied at 5 attempts: C + 0.10*(0.85 - 0.7) = 1.0 + 0.015 = 1.015
    c_adj = update_observed_complexity(1.0, 0.7, 5)
    assert abs(c_adj - 1.015) < 1e-9
    print("  ✓ complexity (structural, C_0, observed correction)")


def test_mastery():
    from app.memory.mastery import (
        calculate_required_streak,
        check_mastery_procedural,
        project_additional_probes,
    )

    # Procedural: N_req = ceil(2 + C)
    assert calculate_required_streak(0.5, True) == 3  # ceil(2.5)
    assert calculate_required_streak(1.0, True) == 3  # ceil(3.0)
    assert calculate_required_streak(2.0, True) == 4  # ceil(4.0)

    # Claim-coverage: k = max(2, ceil(C+1))
    assert calculate_required_streak(0.5, False) == 2  # max(2, ceil(1.5)) = 2
    assert calculate_required_streak(1.0, False) == 2  # max(2, ceil(2.0)) = 2
    assert calculate_required_streak(2.0, False) == 3  # max(2, ceil(3.0)) = 3

    # Projection: Laplace smoothed
    # 0 attempts → p̂ = 1/2 = 0.5
    proj = project_additional_probes(3, 0, 0, 0)
    assert abs(proj - 3/0.5) < 1e-9  # 6.0

    assert check_mastery_procedural(3, 3) is True
    assert check_mastery_procedural(2, 3) is False
    print("  ✓ mastery (N_req, projection, procedural check)")


def test_curriculum_priority():
    from app.memory.scheduler import calculate_priority

    # Low recall + high readiness + high centrality → high priority
    p = calculate_priority(0.2, [0.8, 0.9], 0.5, 24.0)
    assert p > 0.0

    # Within recency guard → 0
    p2 = calculate_priority(0.2, [0.8], 0.5, 6.0)
    assert p2 == 0.0

    # No prereqs → readiness = 1.0
    p3 = calculate_priority(0.3, [], 0.4, 24.0)
    assert p3 > 0
    print("  ✓ curriculum_priority")


def test_evaluation_metrics():
    from app.evaluation.metrics import (
        calculate_cohens_kappa,
        calculate_brier_score,
        calculate_auc,
        calculate_point_biserial,
        calculate_precision_at_k,
    )

    # Perfect kappa
    k = calculate_cohens_kappa(["A", "B", "A"], ["A", "B", "A"])
    assert abs(k - 1.0) < 1e-9

    # Perfect Brier (all correct with 1.0 probability)
    b = calculate_brier_score([1.0, 1.0], [True, True])
    assert abs(b - 0.0) < 1e-9

    # AUC: perfect separation
    auc = calculate_auc([0.9, 0.8], [0.2, 0.1])
    assert abs(auc - 1.0) < 1e-9

    # Precision@k
    p = calculate_precision_at_k([True, False, True, False], 4)
    assert abs(p - 0.5) < 1e-9
    print("  ✓ evaluation metrics (kappa, Brier, AUC, P@k)")


if __name__ == "__main__":
    print("\n=== Kaizou Grading & Memory Smoke Tests ===\n")
    test_cosine_similarity()
    test_claim_weight()
    test_coverage()
    test_claim_matching()
    test_precision()
    test_kendall_tau_b()
    test_verbatim()
    test_composite()
    test_gap_report()
    test_recall_probability()
    test_half_life_dynamics()
    test_complexity()
    test_mastery()
    test_curriculum_priority()
    test_evaluation_metrics()
    print("\n=== ALL TESTS PASSED ===\n")
