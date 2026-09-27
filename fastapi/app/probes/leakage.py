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


# ── Answer-level leakage ────────────────────────────────────────────────────
# A question has to be ABOUT its topic, and a question in the learner's own
# words about a short, simple note is always close to one of its claims
# ("How do plants make their food?" vs "Plants make their own food."). That is
# not a leak: the answer (how) is in the other claims. So one claim may be
# touched as the topic; the probe leaks when it restates a claim nearly
# verbatim, or touches a large share of the answer's claims.
VERBATIM_OVERLAP: float = 0.80
TOUCHED_SHARE: float = 0.40


def per_claim_overlap(probe_tokens: list[str], claim_token_lists: list[list[str]], n: int = 4) -> list[float]:
    """4-gram overlap of the probe with each claim (fraction of the claim's n-grams)."""
    probe_ngrams = extract_ngrams(probe_tokens, n)
    out = []
    for toks in claim_token_lists:
        cg = extract_ngrams(toks, n)
        out.append(len(probe_ngrams & cg) / len(cg) if cg and probe_ngrams else 0.0)
    return out


CONTENT_COVER: float = 0.5


def content_coverage(probe_text: str, claim_texts: list[str]) -> list[float]:
    """Share of each claim's content words (stemmed) that appear in the probe.

    Embeddings of short on-topic sentences are all near-identical, so
    similarity alone says "same topic", not "gives the answer away". A claim
    is only given away if the probe also carries most of its content words.
    """
    from app.probes.style import SCAFFOLD_WORDS, vocabulary

    probe_vocab = vocabulary(probe_text)
    out = []
    for c in claim_texts:
        words = [w for w in vocabulary(c) if len(w) >= 3 and w not in SCAFFOLD_WORDS]
        out.append(sum(1 for w in words if w in probe_vocab) / len(words) if words else 0.0)
    return out


def assess_answer_leakage(
    similarities: list[float],
    overlaps: list[float],
    coverages: list[float] | None = None,
    semantic_threshold: float = SEMANTIC_LEAK_THRESHOLD,
    lexical_threshold: float = LEXICAL_LEAK_THRESHOLD,
) -> tuple[bool, int, int]:
    """Returns (leaked, touched_claims, allowed_touched).

    A claim is touched when the probe shares its 4-grams (>= τ_ngram), or is
    semantically close (>= τ_leak) AND carries most of its content words.
    Leaked when any claim is restated near-verbatim (4-gram >= 0.8) or more
    claims are touched than the topic allowance max(1, round(0.4 · n)).
    """
    n = max(len(similarities), len(overlaps))
    cov = coverages if coverages is not None else [1.0] * n

    def touched_claim(i: int) -> bool:
        if i < len(overlaps) and overlaps[i] >= lexical_threshold:
            return True
        return (i < len(similarities) and similarities[i] >= semantic_threshold
                and i < len(cov) and cov[i] >= CONTENT_COVER)

    touched = sum(1 for i in range(n) if touched_claim(i))
    allowed = max(1, round(TOUCHED_SHARE * n))
    verbatim = any(o >= VERBATIM_OVERLAP for o in overlaps)
    return verbatim or touched > allowed, touched, allowed
