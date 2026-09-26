"""Note/concept classification via Jev typed decisions (§4.4, C2, C5).

Every output here is "pick one of N labels" or "place on an ordered scale",
so it runs on Jev (TypeSafe AI's decision model) rather than a generative
LLM. One Jev request answers all four questions in parallel.

The label definitions below are the ones this module already used with its
previous JSON prompt; they are carried over unchanged as Jev criteria.
Low-confidence routing (e.g. escalating when ``confidence`` is low) is domain
logic and is intentionally not implemented in this pass.

🔒 Jev classifies the note's content. It never scores learner answers.

Classifies:
- Track: SOURCE_BACKED, SELF_AUTHORED, ANALOGY
- Shape: PROCEDURAL, DEFINITION, ORDERED_PROCESS, CAUSAL_RELATION
- Category: DETERMINISTIC_MECHANISM, CONVENTIONAL, PROBABILISTIC, AXIOMATIC, OUT_OF_SCOPE
- Bloom level: 0.5 (factual), 1.0 (comprehension), 1.5 (application), 2.0 (synthesis)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.providers.classification import (
    Choice,
    ChoiceAnswer,
    JevClient,
    Score,
    ScoreAnswer,
    get_classification_client,
)

logger = logging.getLogger(__name__)

# Jev state is capped at 32k tokens; notes are truncated well below that.
MAX_NOTE_CHARS = 12000

BLOOM_LEVELS = (0.5, 1.0, 1.5, 2.0)


@dataclass
class ClassificationResult:
    """Result of note/concept classification."""
    track: str
    shape: str
    category: str
    bloom_level: float


class NoteClassifier:
    """Classifies notes into track, shape, category, and Bloom level."""

    QUESTIONS = {
        "track": Choice(
            instructions="How is this note's content grounded?",
            criteria={
                "SOURCE_BACKED": "References external sources",
                "SELF_AUTHORED": "Original explanation",
                "ANALOGY": "Compares concepts",
            },
        ),
        "shape": Choice(
            instructions="What structural shape does this note's knowledge take?",
            criteria={
                "PROCEDURAL": "Step-by-step procedure",
                "DEFINITION": "Defines a concept",
                "ORDERED_PROCESS": "Describes ordered causal chain",
                "CAUSAL_RELATION": "Cause-effect relationship",
            },
        ),
        "category": Choice(
            instructions="What kind of knowledge is this?",
            criteria={
                "DETERMINISTIC_MECHANISM": "Deterministic rules/algorithms",
                "CONVENTIONAL": "Social/naming conventions",
                "PROBABILISTIC": "Statistical/probabilistic",
                "AXIOMATIC": "Mathematical axioms",
                "OUT_OF_SCOPE": "Meta/non-academic",
            },
        ),
        "bloom_level": Score(
            instructions="What cognitive level does understanding this note require?",
            criteria=[
                "Factual/rote",
                "Comprehension",
                "Application/procedure",
                "Synthesis/analysis",
            ],
        ),
    }

    def __init__(self, client: JevClient | None = None):
        self._client = client or get_classification_client()

    async def classify(self, text: str) -> ClassificationResult:
        """Classify a note's text into track, shape, category, and Bloom level."""
        decision = await self._client.decide(
            state={"note": text[:MAX_NOTE_CHARS]},
            questions=self.QUESTIONS,
        )
        track = decision.answers["track"]
        shape = decision.answers["shape"]
        category = decision.answers["category"]
        bloom = decision.answers["bloom_level"]
        assert isinstance(track, ChoiceAnswer) and isinstance(shape, ChoiceAnswer)
        assert isinstance(category, ChoiceAnswer) and isinstance(bloom, ScoreAnswer)

        return ClassificationResult(
            track=self._validate_track(track.choice),
            shape=self._validate_shape(shape.choice),
            category=self._validate_category(category.choice),
            bloom_level=self._validate_bloom(bloom.level),
        )

    @staticmethod
    def _validate_track(v: str) -> str:
        valid = {"SOURCE_BACKED", "SELF_AUTHORED", "ANALOGY"}
        return v if v in valid else "SELF_AUTHORED"

    @staticmethod
    def _validate_shape(v: str) -> str:
        valid = {"PROCEDURAL", "DEFINITION", "ORDERED_PROCESS", "CAUSAL_RELATION"}
        return v if v in valid else "DEFINITION"

    @staticmethod
    def _validate_category(v: str) -> str:
        valid = {"DETERMINISTIC_MECHANISM", "CONVENTIONAL", "PROBABILISTIC", "AXIOMATIC", "OUT_OF_SCOPE"}
        return v if v in valid else "DETERMINISTIC_MECHANISM"

    @staticmethod
    def _validate_bloom(level_index: int) -> float:
        """Map a Jev score level index (0..3) onto the Bloom prior value."""
        idx = min(max(int(level_index), 0), len(BLOOM_LEVELS) - 1)
        return BLOOM_LEVELS[idx]
