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
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class GapItem:
    """A single missing claim in the gap report."""
    claim_text: str
    weight: float
    is_transition: bool
    is_load_bearing: bool
    prerequisite_concept_id: Optional[str] = None
    prerequisite_concept_label: Optional[str] = None


@dataclass
class GapReport:
    """Complete gap report for a graded attempt."""
    missing_claims: list[GapItem] = field(default_factory=list)
    total_required: int = 0
    total_matched: int = 0
    coverage: float = 0.0
    band: str = ""

    def to_dict(self) -> dict:
        """Serialise to JSON-safe dict for storage in attempts.gap_report."""
        return {
            "missing_claims": [
                {
                    "claim_text": item.claim_text,
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