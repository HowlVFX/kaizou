"""Verbatim penalty calculation (§5.6).

Measures copying from source material rather than reformulating.
Computed on token sequences so whitespace/punctuation differences don't matter.

    lcs = length of longest common contiguous token subsequence(answer, source)
    v   = lcs / tokens(answer)

Piecewise penalty with dead zone v_0 = 0.35:

    verbatim_penalty = max(0, (v − v_0) / (1 − v_0))

Below 35% contiguous overlap the penalty is exactly zero (unavoidable overlap
from technical terms, formula names, standard phrasings).

Asymmetry (§5.6): penalty applies at probe time only. At ingest validation
it is recorded but does NOT reduce correctness figures.
"""

from __future__ import annotations


def longest_common_contiguous_subsequence(
    tokens_a: list[str],
    tokens_b: list[str],
) -> int:
    """Find the length of the longest common contiguous token subsequence.

    Uses a standard DP approach (suffix-array style) in O(n·m) time
    where n = len(tokens_a), m = len(tokens_b).

    We compare tokens case-insensitively to ignore capitalisation differences
    in technical terms.
    """
    if not tokens_a or not tokens_b:
        return 0

    n = len(tokens_a)
    m = len(tokens_b)

    # Normalise for case-insensitive comparison
    a_lower = [t.lower() for t in tokens_a]
    b_lower = [t.lower() for t in tokens_b]

    # prev[j] = length of longest common contiguous subsequence ending at
    # tokens_a[i-1] and tokens_b[j-1]
    prev = [0] * (m + 1)
    best = 0

    for i in range(1, n + 1):
        curr = [0] * (m + 1)
        for j in range(1, m + 1):
            if a_lower[i - 1] == b_lower[j - 1]:
                curr[j] = prev[j - 1] + 1
                if curr[j] > best:
                    best = curr[j]
            else:
                curr[j] = 0
        prev = curr

    return best


def calculate_verbatim_ratio(
    answer_tokens: list[str],
    source_tokens: list[str],
) -> float:
    """Compute the raw verbatim overlap ratio.

    v = lcs / tokens(answer)

    Args:
        answer_tokens: tokenised learner answer.
        source_tokens: tokenised source text (the material they should
                       not be copying from at probe time).

    Returns:
        Overlap ratio in [0, 1]. Returns 0.0 if the answer is empty.
    """
    if not answer_tokens:
        return 0.0

    lcs_length = longest_common_contiguous_subsequence(
        answer_tokens, source_tokens,
    )
    return lcs_length / len(answer_tokens)


def calculate_verbatim_penalty(
    v: float,
    v_0: float = 0.35,
) -> float:
    """Apply the piecewise dead-zone penalty.

    verbatim_penalty = max(0, (v − v_0) / (1 − v_0))

    Below v_0 (default 0.35) the penalty is exactly zero.
    At v = 1.0 (pure copy) the penalty is 1.0.

    Args:
        v: raw verbatim ratio from calculate_verbatim_ratio().
        v_0: dead-zone floor (default 0.35, §5.26).

    Returns:
        Penalty in [0, 1].
    """
    if v <= v_0:
        return 0.0

    # Guard against v_0 == 1.0 (would cause division by zero)
    if v_0 >= 1.0:
        return 0.0

    return (v - v_0) / (1.0 - v_0)