"""Contradiction detection via NLI (§5.10).

Answers "is what the learner wrote actually *wrong*" — as opposed to
"incomplete". Uses a fixed NLI model (not LLM-as-judge).

For each learner claim s_j, evaluate against every source claim c_i:
    P_entail(c_i, s_j), P_neutral(c_i, s_j), P_contradict(c_i, s_j)

    contradiction(s_j) = 𝟙(max_i P_contradict(c_i, s_j) >= θ_c)
    contradiction_count = Σ_j contradiction(s_j)

θ_c = 0.70

🔒 Contradictions are reported as a count with offending pairs shown,
never folded into a score. A single flat contradiction is qualitatively
different from three vague ones (§5.10).

The NLI model is a fixed discriminative classifier producing a calibrated
3-way distribution, reproducible across runs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

# Constants (§5.26)
CONTRADICTION_THRESHOLD: float = 0.70


@dataclass
class NLIResult:
    """3-way NLI classification result."""
    entailment: float
    neutral: float
    contradiction: float


@dataclass
class ContradictionPair:
    """A flagged contradiction between a source and learner claim."""
    source_claim: str
    learner_claim: str
    contradiction_score: float
    source_index: int
    learner_index: int


@dataclass
class ContradictionReport:
    """Full contradiction detection report (§5.10)."""
    contradiction_count: int
    contradiction_rate: float
    flagged_pairs: list[ContradictionPair]

    def to_dict(self) -> dict:
        """Serialise for storage."""
        return {
            "contradiction_count": self.contradiction_count,
            "contradiction_rate": self.contradiction_rate,
            "flagged_pairs": [
                {
                    "source_claim": p.source_claim,
                    "learner_claim": p.learner_claim,
                    "score": p.contradiction_score,
                    "source_index": p.source_index,
                    "learner_index": p.learner_index,
                }
                for p in self.flagged_pairs
            ],
        }


class NLIClassifier(Protocol):
    """Protocol for the NLI model backend.

    Implementations should wrap a cross-encoder model (e.g.,
    cross-encoder/nli-deberta-v3-base) and return calibrated
    3-way distributions.
    """

    async def classify(
        self, premise: str, hypothesis: str,
    ) -> NLIResult:
        """Classify the NLI relationship between premise and hypothesis."""
        ...


class ContradictionDetector:
    """Detects contradictions between source claims and learner assertions.

    Uses an NLI classifier (injected) — not LLM-as-judge.
    """

    def __init__(
        self,
        nli_classifier: NLIClassifier,
        threshold: float = CONTRADICTION_THRESHOLD,
    ):
        self._nli = nli_classifier
        self._threshold = threshold

    async def detect(
        self,
        source_claims: list[str],
        learner_claims: list[str],
    ) -> ContradictionReport:
        """Run full contradiction detection (§5.10).

        For each learner claim, check against ALL source claims.
        A learner claim is contradictory if max_i P_contradict >= θ_c.

        Returns:
            ContradictionReport with count, rate, and flagged pairs.
        """
        flagged: list[ContradictionPair] = []

        for j, learner_claim in enumerate(learner_claims):
            max_score = 0.0
            max_source_idx = -1

            for i, source_claim in enumerate(source_claims):
                result = await self._nli.classify(
                    premise=source_claim,
                    hypothesis=learner_claim,
                )
                if result.contradiction > max_score:
                    max_score = result.contradiction
                    max_source_idx = i

            if max_score >= self._threshold:
                flagged.append(ContradictionPair(
                    source_claim=source_claims[max_source_idx],
                    learner_claim=learner_claim,
                    contradiction_score=max_score,
                    source_index=max_source_idx,
                    learner_index=j,
                ))

        m = len(learner_claims)
        count = len(flagged)

        return ContradictionReport(
            contradiction_count=count,
            contradiction_rate=count / m if m > 0 else 0.0,
            flagged_pairs=flagged,
        )


def build_interpretation_matrix(
    source_coverage: float,
    contradiction_count: int,
) -> str:
    """Return the interpretation reading (§5.11).

    | coverage | contradictions | Reading |
    |----------|----------------|---------|
    | high     | 0              | Faithful and reasonably complete |
    | low      | 0              | Correct but partial |
    | high     | > 0            | Broadly right but contains specific error |
    | low      | > 0            | Diverges from source substantially |
    """
    high_coverage = source_coverage >= 0.70  # reasonable threshold

    if high_coverage and contradiction_count == 0:
        return "Note is faithful and reasonably complete"
    elif not high_coverage and contradiction_count == 0:
        return "Note is correct but partial — not an error, possibly deliberate"
    elif high_coverage and contradiction_count > 0:
        return "Note is broadly right but contains a specific error"
    else:
        return "Note diverges from the source substantially"