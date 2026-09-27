"""Claim extraction from notes (§5.2, §4.5).

Extracts structured claims from note text using LLM structured output.
Also extracts [[wikilinks]] deterministically and prerequisite concepts.

🔒 LLM generates structured objects. It does not grade or judge.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from app.providers.generation import GenerationClient, strict_object

logger = logging.getLogger(__name__)

# Structured-output schemas for the existing prompts. Every field is required;
# "absent" is an explicit null, which keeps constrained decoding reliable.
CLAIMS_SCHEMA = strict_object({
    "claims": {
        "type": "array",
        "items": strict_object({
            "text": {"type": "string"},
            "order_index": {"type": ["integer", "null"]},
            "is_transition": {"type": "boolean"},
            "is_load_bearing": {"type": "boolean"},
            "branch_id": {"type": ["string", "null"]},
            "aliases": {"type": "array", "items": {"type": "string"}},
        }),
    },
})

PREREQUISITES_SCHEMA = strict_object({
    "prerequisites": {
        "type": "array",
        "items": strict_object({
            "label": {"type": "string"},
            # The level a learner must be at to understand this prerequisite.
            "level": {"type": "string", "enum": ["young_child", "school", "university", "expert"]},
        }),
    },
})

# Prerequisite level bands, lowest first. A note's band caps which
# prerequisites it may create: a young child's note never gets "Cell biology".
PREREQ_LEVELS = ("young_child", "school", "university", "expert")
PREREQ_LEVEL_TEXT = {
    "young_child": "a young child (everyday ideas like sunlight, water, food, sugar)",
    "school": "a school student (basic school-level ideas)",
    "university": "a university student",
    "expert": "a specialist",
}
# Fewer, simpler prerequisites for simpler notes.
PREREQ_MAX_BY_LEVEL = {"young_child": 2, "school": 3, "university": 4, "expert": 5}
_READING_TO_BAND = {"very simple": 0, "simple": 1, "standard": 2, "technical": 3}


def note_level_band(text: str, bloom_level: float | None = None) -> str:
    """The level band a note is written at, from its reading level (sentence
    and word length) and, when known, its Bloom level. Deterministic.

    Bloom >= 1.5 (application/synthesis) raises the band by one, but never
    for a very simply written note: a child applying an idea is still a child.
    """
    from app.probes.style import reading_level

    band = _READING_TO_BAND[reading_level(text)]
    if bloom_level is not None and bloom_level >= 1.5 and band >= 1:
        band = min(band + 1, len(PREREQ_LEVELS) - 1)
    return PREREQ_LEVELS[band]

EMBEDDED_ANALOGY_SCHEMA = strict_object({
    "has_analogy": {"type": "boolean"},
    "analogy_label": {"type": "string"},
    "analogy_claims": {"type": "array", "items": {"type": "string"}},
})

# Cheap deterministic gate: the paid analogy-detection call only runs when the
# note contains wording that usually introduces a comparison.
ANALOGY_CUE_PATTERN = re.compile(
    r"\b(is like|are like|was like|just like|kind of like|sort of like|works like|"
    r"acts like|like a|like an|similar to|think of (?:it|this|them|that) as|"
    r"imagine|analog(?:y|ies|ous)|as if|compared? to|comparable to|"
    r"the same way (?:as|that))\b",
    re.IGNORECASE,
)


def has_analogy_cue(text: str) -> bool:
    """True when the text contains wording that typically introduces an analogy."""
    return bool(text and ANALOGY_CUE_PATTERN.search(text))


@dataclass
class EmbeddedAnalogy:
    """An analogy the learner wrote inside a note about another concept."""
    label: str
    claims: list[str]


@dataclass
class ExtractedClaim:
    """A single claim extracted from a note."""
    text: str
    order_index: int | None = None
    is_transition: bool = False
    is_load_bearing: bool = False
    branch_id: str | None = None
    aliases: list[str] = field(default_factory=list)


# Deterministic wikilink extraction
WIKILINK_PATTERN = re.compile(r'\[\[([^\]]+)\]\]')


def extract_wikilinks(markdown: str) -> list[str]:
    """Extract [[wikilink]] targets from markdown — fully deterministic."""
    matches = WIKILINK_PATTERN.findall(markdown)
    seen: set[str] = set()
    unique: list[str] = []
    for target in matches:
        normalised = target.strip()
        if normalised.lower() not in seen:
            seen.add(normalised.lower())
            unique.append(normalised)
    return unique


class ClaimExtractor:
    """Extracts claims and prerequisites from note text via LLM."""

    CLAIM_PROMPT = """You extract the distinct claims a learner made in their own note.

Faithfulness rules (strict):
- Only include what the text itself states. Never add outside knowledge, extra detail, technical terms, numbers or examples the learner did not write.
- Keep the learner's own words, vocabulary and level. If the note is written simply (e.g. for a child), the claims must be equally simple.
- Write each claim with the learner's exact wording wherever possible: split or trim their sentences, but do not reword them or swap in synonyms (if they wrote "make", keep "make", not "produce").
- Do not generalise or broaden a claim beyond what was written. Fewer faithful claims are better than many embellished ones.

For each claim provide:
- text: the claim as a standalone sentence
- order_index: position in logical sequence (null if no natural ordering)
- is_transition: true if the claim describes a state change or causal step (A→B)
- is_load_bearing: true if altering this claim would change downstream conclusions
- branch_id: identifier if the claim belongs to a conditional branch (null otherwise)
- aliases: list of known alternative surface forms for key terms

Return JSON: {"claims": [{"text": "...", "order_index": ..., "is_transition": ..., "is_load_bearing": ..., "branch_id": ..., "aliases": [...]}]}"""

    PREREQ_PROMPT = """Identify the concepts that are prerequisites (required prior knowledge) for understanding this text about "{label}".

Rules:
- List at most {max_items} prerequisites, most fundamental first.
- When an existing concept label below fits, return that label exactly.
- Otherwise return a short canonical concept name (2-5 words, no explanation).
- Do not list "{label}" itself or concepts the text merely mentions in passing.
- The learner writes at the level of {note_level}. Only list ideas that person would genuinely need to already understand to follow THIS text as written, and that they could actually learn next. Never list advanced or broad topics the text does not rely on (a child's note about plants needs "Sunlight", not "Cell biology").
- Name each prerequisite in words that learner would use.
- For each one, set "level" to who could understand it: young_child, school, university or expert.
- Return an empty list if the text needs no prior knowledge.

Return JSON: {"prerequisites": [{"label": "concept_label_1", "level": "school"}]}

Existing concepts: {concepts}"""

    # Cache variant for prerequisite extraction so it never shares an entry
    # with another generation call on the same text.
    PREREQ_VARIANT = "prerequisites-v3"
    MAX_PREREQUISITES = 5

    def __init__(self, client: GenerationClient | None = None, *, conn=None):
        if client is None:
            from app.providers.generation import get_guarded_generation_client
            client = get_guarded_generation_client(conn=conn)
        self._client = client

    async def extract_claims(self, text: str, shape: str = "DEFINITION") -> list[ExtractedClaim]:
        """Extract structured claims from note text."""
        result = await self._client.generate_structured(
            system=self.CLAIM_PROMPT,
            prompt=f"Shape: {shape}\n\nText:\n{text[:6000]}",
            schema=CLAIMS_SCHEMA,
        )
        return [
            ExtractedClaim(
                text=c.get("text", ""),
                order_index=c.get("order_index"),
                is_transition=bool(c.get("is_transition", False)),
                is_load_bearing=bool(c.get("is_load_bearing", False)),
                branch_id=c.get("branch_id"),
                aliases=c.get("aliases", []),
            )
            for c in result.data.get("claims", [])
            if c.get("text")
        ]

    async def extract_prerequisites(
        self, text: str, existing_concepts: list[str], concept_label: str = "",
        bloom_level: float | None = None,
    ) -> list[str]:
        """Extract prerequisite concept labels from text, at the note's level.

        Labels may name existing concepts or new ones; the caller resolves
        them (existing concept or UNRESOLVED_PREREQUISITE placeholder).
        Prerequisites rated above the note's level band are dropped, and
        simpler notes get fewer of them.
        """
        if not text.strip():
            return []
        band = note_level_band(text, bloom_level)
        max_rank = PREREQ_LEVELS.index(band)
        max_items = min(self.MAX_PREREQUISITES, PREREQ_MAX_BY_LEVEL[band])

        # Sorted so the prompt (and so the cache key) is stable for the same graph.
        concepts_str = ", ".join(sorted(set(existing_concepts))[:100]) or "(none)"
        label = concept_label.strip() or "this note"
        # str.replace, not str.format: the prompt contains literal JSON braces.
        prompt = (
            self.PREREQ_PROMPT
            .replace("{concepts}", concepts_str)
            .replace("{label}", label)
            .replace("{max_items}", str(max_items))
            .replace("{note_level}", PREREQ_LEVEL_TEXT[band])
        )

        result = await self._client.generate_structured(
            system=prompt,
            prompt=text[:4000],
            schema=PREREQUISITES_SCHEMA,
            variant=self.PREREQ_VARIANT,
        )
        own = label.lower()
        out: list[str] = []
        seen: set[str] = set()
        for p in result.data.get("prerequisites", []):
            if isinstance(p, dict):
                lvl = p.get("level")
                if lvl in PREREQ_LEVELS and PREREQ_LEVELS.index(lvl) > max_rank:
                    logger.info("Dropped prerequisite %r (%s) above note level %s", p.get("label"), lvl, band)
                    continue
                p = p.get("label")
            if not isinstance(p, str):
                continue
            cleaned = " ".join(p.split())[:120]
            key = cleaned.lower()
            if not cleaned or key == own or key in seen:
                continue
            seen.add(key)
            out.append(cleaned)
        return out[:max_items]

    ANALOGY_PROMPT = """A learner wrote a note about "{label}". Decide whether the note explains "{label}" through an analogy or comparison to something else (e.g. "the leaf is like a kitchen").

Rules:
- has_analogy is true ONLY if the learner actually uses an analogy/comparison to explain "{label}". A passing use of words like "like" or "imagine" is not enough.
- analogy_label: a short name for the analogy, e.g. "{label} as a kitchen" (3-8 words). Empty string if none.
- analogy_claims: the correspondences the learner states, each as one short sentence in the learner's own words and level (e.g. "The sun is like the stove's heat."). Never add correspondences the learner did not write. Empty list if none.

Return JSON: {"has_analogy": true/false, "analogy_label": "...", "analogy_claims": ["..."]}"""

    ANALOGY_VARIANT = "embedded-analogy-v1"
    MAX_ANALOGY_CLAIMS = 8

    async def extract_embedded_analogy(self, text: str, concept_label: str) -> EmbeddedAnalogy | None:
        """Detect an analogy the learner used inside a note (None if absent)."""
        if not text.strip():
            return None
        label = concept_label.strip() or "this concept"
        result = await self._client.generate_structured(
            system=self.ANALOGY_PROMPT.replace("{label}", label),
            prompt=text[:6000],
            schema=EMBEDDED_ANALOGY_SCHEMA,
            variant=self.ANALOGY_VARIANT,
        )
        data = result.data or {}
        if not data.get("has_analogy"):
            return None
        claims = [
            " ".join(c.split())[:400]
            for c in (data.get("analogy_claims") or [])
            if isinstance(c, str) and c.strip()
        ][: self.MAX_ANALOGY_CLAIMS]
        name = " ".join(str(data.get("analogy_label") or "").split())[:120]
        if not claims:
            return None
        return EmbeddedAnalogy(label=name or f"Analogy for {label}", claims=claims)
