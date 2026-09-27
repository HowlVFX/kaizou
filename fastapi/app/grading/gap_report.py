"""Gap report generation (§5.9).

The gap report is the learner-facing output — the inverse of coverage.
Not a new computation; it identifies which required claims were missed.

    gaps = [c_i for i in 1..n if not matched(c_i)]
           sorted by w_i descending

For each gap, if the claim traces to a REQUIRES prerequisite, attach a
pointer to that node: "this requires understanding [node] first."

🔒 The gap report replaces the model answer. The template is never
displayed. Showing the answer key leaks the claim set the next probe
grades against and makes the verbatim penalty meaningless (§5.9).

So the serialised report never carries claim text. Each gap is described by
its position in the answer key, its structural category, and a redacted cue
(the opening word or two, the rest elided) that points the learner at the
area they missed without handing them the sentence. ``GapItem.claim_text``
is kept in memory for server-side use only and is never serialised.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

REDACTED = "…"


def redacted_cue(claim_text: str) -> str:
    """Build a non-revealing cue for a missed claim.

    Shows the first two words of claims with >= 6 words (one word for
    shorter claims) and elides the remainder, with the hidden word count so
    the learner can gauge how much is missing. Never returns the full claim.
    """
    words = (claim_text or "").split()
    if not words:
        return REDACTED
    n_show = 2 if len(words) >= 6 else 1
    if len(words) <= n_show:
        # One-word claim: showing it would reveal it entirely.
        return f"{REDACTED} (1 word)"
    hidden = len(words) - n_show
    return f"{' '.join(words[:n_show])} {REDACTED} ({hidden} more words)"


def claim_category(is_transition: bool, is_load_bearing: bool) -> str:
    """Structural role of a claim, for learner-facing hints."""
    if is_transition:
        return "transition"
    if is_load_bearing:
        return "load_bearing"
    return "supporting"


@dataclass
class GapItem:
    """A single missing claim in the gap report."""
    claim_text: str                     # server-side only — never serialised
    weight: float
    is_transition: bool
    is_load_bearing: bool
    prerequisite_concept_id: Optional[str] = None
    prerequisite_concept_label: Optional[str] = None
    claim_index: int = -1

    @property
    def category(self) -> str:
        return claim_category(self.is_transition, self.is_load_bearing)

    @property
    def hint(self) -> str:
        return redacted_cue(self.claim_text)


@dataclass
class GapReport:
    """Complete gap report for a graded attempt."""
    missing_claims: list[GapItem] = field(default_factory=list)
    total_required: int = 0
    total_matched: int = 0
    coverage: float = 0.0
    band: str = ""

    def to_dict(self) -> dict:
        """Serialise to a JSON-safe, answer-key-free dict (§5.9)."""
        return {
            "missing_claims": [
                {
                    "claim_index": item.claim_index,
                    "category": item.category,
                    "hint": item.hint,
                    "weight": item.weight,
                    "is_transition": item.is_transition,
                    "is_load_bearing": item.is_load_bearing,
                    "prerequisite_concept_id": item.prerequisite_concept_id,
                    "prerequisite_concept_label": item.prerequisite_concept_label,
                }
                for item in self.missing_claims
            ],
            "total_required": self.total_required,
            "total_matched": self.total_matched,
            "coverage": self.coverage,
            "band": self.band,
        }


class GapReportBuilder:
    """Builds gap reports from grading results."""

    def build(
        self,
        matched_claims: list[bool],
        answer_key_claims: list[str],
        weights: list[float],
        is_transition: Optional[list[bool]] = None,
        is_load_bearing: Optional[list[bool]] = None,
        prerequisite_pointers: Optional[dict[str, tuple[str, str]]] = None,
        coverage: float = 0.0,
        band: str = "",
    ) -> GapReport:
        """Build the gap report from grading results.

        Args:
            matched_claims: bool per required claim — was it covered?
            answer_key_claims: text of each required claim.
            weights: weight of each required claim.
            is_transition: bool per claim — is it a transition claim?
            is_load_bearing: bool per claim — is it load-bearing?
            prerequisite_pointers: optional mapping from claim text →
                (concept_id, concept_label) for claims that trace to a
                REQUIRES prerequisite. Reuses existing graph edges.
            coverage: the computed coverage score (for reference).
            band: the understanding band classification.

        Returns:
            GapReport with missing claims sorted by weight descending.
        """
        n = len(answer_key_claims)
        if len(matched_claims) != n or len(weights) != n:
            raise ValueError(
                f"Length mismatch: {n} claims, {len(matched_claims)} matched, "
                f"{len(weights)} weights"
            )

        # Default transition/load-bearing flags
        transitions = is_transition or [False] * n
        load_bearings = is_load_bearing or [False] * n
        prereq_map = prerequisite_pointers or {}

        # Collect unmatched claims
        gaps: list[GapItem] = []
        for i in range(n):
            if not matched_claims[i]:
                claim_text = answer_key_claims[i]

                # Look up prerequisite pointer
                prereq_id = None
                prereq_label = None
                if claim_text in prereq_map:
                    prereq_id, prereq_label = prereq_map[claim_text]

                gaps.append(GapItem(
                    claim_text=claim_text,
                    weight=weights[i],
                    is_transition=transitions[i],
                    is_load_bearing=load_bearings[i],
                    prerequisite_concept_id=prereq_id,
                    prerequisite_concept_label=prereq_label,
                    claim_index=i,
                ))

        # Sort by weight descending — most important gaps first
        gaps.sort(key=lambda g: g.weight, reverse=True)

        total_matched = sum(1 for m in matched_claims if m)

        return GapReport(
            missing_claims=gaps,
            total_required=n,
            total_matched=total_matched,
            coverage=coverage,
            band=band,
        )
