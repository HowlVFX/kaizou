"""Decide whether a source-backed note agrees with its attached source.

Grounding is the share of the note's own claims that match a source claim
(reverse match at τ = 0.82). A shorter note that still agrees with the source
stays above the floor. A note is incorrect when that share is below 0.70, or
when a claim that does not match the source is also contradicted by it.
A claim the source already supports is not rejected on a contradiction flag:
paraphrases often trip that check.
"""
from __future__ import annotations

# Same τ as Settings.semantic_match_threshold (§5.2).
SOURCE_MATCH_THRESHOLD = 0.82
# Same "high coverage" bar as build_interpretation_matrix (§5.11).
GROUNDING_FLOOR = 0.70
# Cap source text sent to claim extraction so a long attachment cannot stall ingest.
SOURCE_TEXT_LIMIT = 12000


def grounding_fraction(supported: list[bool]) -> float:
    """Share of note claims that are supported by the source. Empty → 0."""
    if not supported:
        return 0.0
    return sum(1 for flag in supported if flag) / len(supported)


def unsupported_contradiction_count(supported: list[bool], contradicted: list[bool]) -> int:
    """Contradicted note claims that the source match did not already support."""
    n = min(len(supported), len(contradicted))
    return sum(1 for i in range(n) if contradicted[i] and not supported[i])


def is_incorrect_note(grounding: float, unsupported_contradictions: int = 0) -> bool:
    return grounding < GROUNDING_FLOOR or unsupported_contradictions > 0


def rejection_reason(grounding: float, unsupported_contradictions: int) -> str:
    pct = round(grounding * 100)
    low = grounding < GROUNDING_FLOOR
    if unsupported_contradictions > 0 and low:
        return (
            f"Only {pct}% of this note is supported by the attached source, "
            "and it contradicts that source."
        )
    if unsupported_contradictions > 0:
        return "This note contradicts the attached source."
    return f"Only {pct}% of this note is supported by the attached source."
