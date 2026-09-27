"""Match probes to the learner's own writing (level + vocabulary).

A question should read as if it were built from the learner's note: same
words, same sentence length, same difficulty. Two deterministic pieces:

* ``reading_level(text)``: a coarse level from sentence and word length,
  turned into a concrete writing instruction for the generator.
* ``unfamiliar_words(question, vocab)``: content words in a generated question
  that the learner never wrote (crude stemming). The probe service rejects and
  regenerates questions that use too many of them.

No AI here; this is pure text statistics.
"""
from __future__ import annotations

import re

_WORD = re.compile(r"[A-Za-z][A-Za-z'\-]*")
_SENTENCE_SPLIT = re.compile(r"[.!?\n]+")

# Question scaffolding the generator legitimately needs even if the note
# never uses these words. Anything else must come from the note.
SCAFFOLD_WORDS = frozenset({
    "what", "which", "when", "where", "why", "how", "who", "whose", "does",
    "do", "did", "done", "can", "could", "would", "should", "will", "might",
    "your", "you", "yours", "note", "notes", "explain", "describe", "tell",
    "say", "says", "said", "write", "fill", "blank", "missing", "word", "words",
    "happen", "happens", "happened", "change", "changes", "changed", "stay",
    "stays", "same", "different", "difference", "instead", "because", "reason",
    "step", "steps", "order", "first", "next", "last", "then", "after",
    "before", "during", "example", "true", "false", "right", "wrong", "correct",
    "choose", "pick", "option", "options", "answer", "group", "groups", "sort",
    "put", "together", "belong", "if", "not", "also", "only", "some", "each",
    "every", "other", "another", "more", "less", "most", "least", "about",
    "why", "own", "think", "mean", "means", "like", "used", "use", "uses",
    "part", "parts", "thing", "things", "something", "anything", "happening",
    "would", "still", "again", "without", "with", "into", "from", "these",
    "those", "this", "that", "them", "they", "their", "there", "here", "have",
    "has", "had", "been", "being", "were", "was", "are", "is", "the", "and",
    "for", "but", "all", "any", "one", "two", "three", "many", "much", "very",
    "just", "such", "than", "over", "under", "away", "back", "ways", "way",
    "situation", "imagine", "suppose", "stop", "stops", "work", "works",
    "working", "analogy", "real", "kind", "comparison", "compare", "keep",
})


def _stem(word: str) -> str:
    w = word.lower().strip("'-")
    for suffix in ("ingly", "edly", "ness", "ment", "ing", "ies", "ied", "ed", "es", "ly", "s"):
        if len(w) - len(suffix) >= 3 and w.endswith(suffix):
            w = w[: -len(suffix)]
            if suffix in ("ies", "ied"):
                w += "y"
            break
    return w


def vocabulary(*texts: str) -> set[str]:
    """Stemmed vocabulary of the learner's writing (note body + claims)."""
    out: set[str] = set()
    for t in texts:
        for m in _WORD.findall(t or ""):
            out.add(_stem(m))
    return out


def unfamiliar_words(question: str, vocab: set[str]) -> list[str]:
    """Content words in ``question`` the learner never used (in order, unique)."""
    if not vocab:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for m in _WORD.findall(question or ""):
        lw = m.lower()
        if len(lw) < 4 or lw in SCAFFOLD_WORDS:
            continue
        s = _stem(lw)
        if s in vocab or s in seen or _stem(s) in vocab:
            continue
        seen.add(s)
        out.append(lw)
    return out


def reading_level(text: str) -> str:
    """'very simple' | 'simple' | 'standard' | 'technical' from text statistics."""
    words = _WORD.findall(text or "")
    if len(words) < 5:
        return "simple"
    sentences = [s for s in _SENTENCE_SPLIT.split(text) if _WORD.search(s)]
    words_per_sentence = len(words) / max(1, len(sentences))
    avg_len = sum(len(w) for w in words) / len(words)
    long_share = sum(1 for w in words if len(w) >= 9) / len(words)
    if avg_len < 4.7 and words_per_sentence <= 12 and long_share < 0.05:
        return "very simple"
    if avg_len < 4.9 and words_per_sentence <= 20 and long_share < 0.12:
        return "simple"
    if avg_len < 5.6 and long_share < 0.2:
        return "standard"
    return "technical"


LEVEL_INSTRUCTIONS = {
    "very simple": (
        "The learner writes very simply (short sentences, everyday words, like "
        "a young child). Write the question the same way: one short sentence, "
        "small everyday words, nothing tricky. Ask about one idea only."
    ),
    "simple": (
        "The learner writes simply. Keep the question short and plain, with "
        "everyday words. Ask about one idea at a time."
    ),
    "standard": (
        "The learner writes in normal, clear language. Match it: clear "
        "sentences, no technical terms beyond the ones they used."
    ),
    "technical": (
        "The learner writes technically. You may use the technical terms they "
        "used, but no others."
    ),
}
