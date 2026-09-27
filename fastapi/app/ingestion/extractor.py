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
    "prerequisites": {"type": "array", "items": {"type": "string"}},
})


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

    CLAIM_PROMPT = """You are an expert knowledge analyst. Extract the distinct factual claims from this text.

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
- Return an empty list if the text needs no prior knowledge.

Return JSON: {"prerequisites": ["concept_label_1", "concept_label_2"]}

Existing concepts: {concepts}"""

    # Cache variant for prerequisite extraction so it never shares an entry
    # with another generation call on the same text.
    PREREQ_VARIANT = "prerequisites-v2"
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
    ) -> list[str]:
        """Extract prerequisite concept labels from text.

        Labels may name existing concepts or new ones; the caller resolves
        them (existing concept or UNRESOLVED_PREREQUISITE placeholder).
        """
        if not text.strip():
            return []

        # Sorted so the prompt (and so the cache key) is stable for the same graph.
        concepts_str = ", ".join(sorted(set(existing_concepts))[:100]) or "(none)"
        label = concept_label.strip() or "this note"
        # str.replace, not str.format: the prompt contains literal JSON braces.
        prompt = (
            self.PREREQ_PROMPT
            .replace("{concepts}", concepts_str)
            .replace("{label}", label)
            .replace("{max_items}", str(self.MAX_PREREQUISITES))
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
            if not isinstance(p, str):
                continue
            cleaned = " ".join(p.split())[:120]
            key = cleaned.lower()
            if not cleaned or key == own or key in seen:
                continue
            seen.add(key)
            out.append(cleaned)
        return out[: self.MAX_PREREQUISITES]