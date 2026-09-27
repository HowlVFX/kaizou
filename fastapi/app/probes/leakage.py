"""Probe leakage validation (§5.15).

Hard constraint — system analogue of a compiler error. Produces a crisp
regenerate signal rather than a soft score.

Two checks:
    leak_semantic = max_i sim(probe_text, c_i)    over required claims
    leak_lexical  = max_i (|ngrams_4(probe) ∩ ngrams_4(c_i)| / |ngrams_4(c_i)|)

    valid = (leak_semantic < τ_leak) AND (leak_lexical < τ_ngram)

    τ_leak = 0.75
    τ_ngram = 0.50

Extended condition: the probe must not be answerable by string-matching
against the specific instance in the note.
"""

from __future__ import annotations

from app.grading.coverage import cosine_similarity

# Constants (§5.26)
SEMANTIC_LEAK_THRESHOLD: float = 0.75
LEXICAL_LEAK_THRESHOLD: float = 0.50


def extract_ngrams(tokens: list[str], n: int = 4) -> set[tuple[str, ...]]:
    """Extract character-level or token-level n-grams from a token list.

    Uses token-level n-grams for robust comparison.
    Tokens are lowercased for case-insensitive matching.
    """
    lowered = [t.lower() for t in tokens]
    if len(lowered) < n:
        # If fewer than n tokens, return the whole sequence as one ngram
        return {tuple(lowered)} if lowered else set()

    return {
        tuple(lowered[i : i + n])
        for i in range(len(lowered) - n + 1)
    }


def check_semantic_leakage(
    probe_embedding: list[float],
    claim_embeddings: list[list[float]],
    threshold: float = SEMANTIC_LEAK_THRESHOLD,
) -> tuple[bool, float]:
    """Check if the probe text leaks answer content semantically (§5.15).

    leak_semantic = max_i sim(probe_text, c_i) over required claims.
    Leaked if leak_semantic >= τ_leak.

    Args:
        probe_embedding: embedding of the generated probe text.
        claim_embeddings: embeddings of all required claims.
        threshold: leakage threshold (default 0.75).

    Returns:
        (is_leaked, max_similarity): whether the probe is leaked and the
        maximum similarity score that triggered it.
    """
    if not claim_embeddings:
        return False, 0.0

    max_sim = max(
        cosine_similarity(probe_embedding, claim_emb)
        for claim_emb in claim_embeddings
    )

    return max_sim >= threshold, max_sim


def check_lexical_leakage(
    probe_tokens: list[str],
    claim_token_lists: list[list[str]],
    n: int = 4,
    threshold: float = LEXICAL_LEAK_THRESHOLD,
) -> tuple[bool, float]:
    """Check if the probe text leaks answer content lexically (§5.15).

    For each claim c_i:
        overlap = |ngrams_n(probe) ∩ ngrams_n(c_i)| / |ngrams_n(c_i)|

    leak_lexical = max_i overlap
    Leaked if leak_lexical >= τ_ngram.

    Args:
        probe_tokens: tokenised probe text.
        claim_token_lists: tokenised text per required claim.
        n: n-gram size (default 4).
        threshold: leakage threshold (default 0.50).

    Returns:
        (is_leaked, max_overlap): whether lexical leakage was detected
        and the max overlap ratio.
    """
    if not claim_token_lists:
        return False, 0.0

    probe_ngrams = extract_ngrams(probe_tokens, n)

    if not probe_ngrams:
        return False, 0.0

    max_overlap = 0.0

    for claim_tokens in claim_token_lists:
        claim_ngrams = extract_ngrams(claim_tokens, n)
        if not claim_ngrams:
            continue

        intersection = probe_ngrams & claim_ngrams
        overlap = len(intersection) / len(claim_ngrams)

        if overlap > max_overlap:
            max_overlap = overlap

    return max_overlap >= threshold, max_overlap


def validate_probe(
    probe_embedding: list[float],
    probe_tokens: list[str],
    claim_embeddings: list[list[float]],
    claim_token_lists: list[list[str]],
    semantic_threshold: float = SEMANTIC_LEAK_THRESHOLD,
    lexical_threshold: float = LEXICAL_LEAK_THRESHOLD,
    ngram_n: int = 4,
) -> tuple[bool, float, float]:
    """Full probe leakage validation (§5.15).

    valid = (leak_semantic < τ_leak) AND (leak_lexical < τ_ngram)

    Args:
        probe_embedding: embedding of the generated probe text.
        probe_tokens: tokenised probe text.
        claim_embeddings: embeddings of all required claims.
        claim_token_lists: tokenised text per required claim.
        semantic_threshold: τ_leak (default 0.75).
        lexical_threshold: τ_ngram (default 0.50).

    Returns:
        (is_valid, semantic_score, lexical_score):
            is_valid = True if the probe passes both checks.
            semantic_score = max similarity against claims.
            lexical_score = max n-gram overlap against claims.
    """
    sem_leaked, sem_score = check_semantic_leakage(
        probe_embedding, claim_embeddings, semantic_threshold,
    )
    lex_leaked, lex_score = check_lexical_leakage(
        probe_tokens, claim_token_lists, n=ngram_n, threshold=lexical_threshold,
    )

    is_valid = not sem_leaked and not lex_leaked

    return is_valid, sem_score, lex_score


def check_cloze_leakage(prompt_text: str, expected_terms: list[str]) -> bool:
    """CLOZE-specific leak: the blanked term (or an alias) appears in the prompt.

    A cloze reproduces its claim with a blank by design, so the n-gram and
    semantic checks would always fire. What must not leak is the answer.
    Returns True if leaked.
    """
    from app.grading.answer_key import normalise_answer

    prompt = f" {normalise_answer(prompt_text)} "
    for term in expected_terms:
        t = normalise_answer(term)
        if t and f" {t} " in prompt:
            return True
    return False
