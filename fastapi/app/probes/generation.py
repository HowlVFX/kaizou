"""Probe generation via LLM (§8).

Generates probe prompts using structured LLM output.
🔒 The LLM generates the probe text. It never sees scores or rubrics.

Probe type selection logic (§8):
    Prestructural  → CLOZE
    Unistructural  → RECALL
    Multistructural → PROCESS_TRACE or CONCEPT_SORT
    Relational     → PERTURBATION or NEAR_TRANSFER
    Extended_Abstract → FAR_TRANSFER or ANALOGY_*
"""
from __future__ import annotations

import logging

from app.providers.generation import GenerationClient, get_generation_client, strict_object

logger = logging.getLogger(__name__)

PROBE_SCHEMA = strict_object({"prompt_text": {"type": "string"}})

# Probe type → prompt template
PROBE_TEMPLATES = {
    "CLOZE": (
        "Create a fill-in-the-blank question about '{label}'. "
        "Remove one key term from a factual statement about this concept. "
        "The blank must test a specific claim, not a generic fact."
    ),
    "RECALL": (
        "Create an open-ended recall question about '{label}'. "
        "Ask the learner to explain the concept in their own words. "
        "The answer should require covering the main claims."
    ),
    "PROCESS_TRACE": (
        "Create a process-trace question about '{label}'. "
        "Ask the learner to walk through the steps of the process/mechanism "
        "in order. The answer should demonstrate sequential understanding."
    ),
    "PROCEDURAL": (
        "Create a procedural question about '{label}'. "
        "Present a concrete input and ask for the expected output. "
        "The answer must be verifiable by execution."
    ),
    "MISCONCEPTION_MCQ": (
        "Create a multiple-choice question about '{label}' where the wrong "
        "answers correspond to common misconceptions. Each distractor must "
        "map to a named misconception. Include 4 options."
    ),
    "CONCEPT_SORT": (
        "Create a concept-sort question. Present 5-6 items that relate to "
        "'{label}' and ask the learner to group them. Include two valid "
        "groupings: one by underlying mechanism and one by surface appearance."
    ),
    "PERTURBATION": (
        "Create a perturbation question about '{label}'. Change one "
        "condition in the process and ask which downstream claims change "
        "and which remain invariant."
    ),
    "NEAR_TRANSFER": (
        "Create a near-transfer question about '{label}'. Present a "
        "novel scenario that requires applying the same principles "
        "in a slightly different context."
    ),
    "FAR_TRANSFER": (
        "Create a far-transfer question about '{label}'. Present a "
        "scenario from a different domain that requires the same "
        "underlying principles."
    ),
    "ANALOGY_FORWARD": (
        "Given the analogy between '{label}' and its target concept, "
        "ask the learner to predict what happens in the target domain "
        "given a change in the source domain."
    ),
    "ANALOGY_SIMULATE": (
        "Ask the learner to simulate the behaviour of '{label}' "
        "by reasoning through the analogy step by step."
    ),
    "ANALOGY_BREAKDOWN": (
        "Ask the learner where the analogy for '{label}' breaks down. "
        "Which aspects of the source do NOT transfer to the target?"
    ),
}

# SOLO level → eligible probe types (§8)
SOLO_PROBE_MAP: dict[str, list[str]] = {
    "Prestructural": ["CLOZE"],
    "Unistructural": ["CLOZE", "RECALL"],
    "Multistructural": ["RECALL", "PROCESS_TRACE", "CONCEPT_SORT"],
    "Relational": [
        "PROCESS_TRACE", "PERTURBATION", "NEAR_TRANSFER",
        "MISCONCEPTION_MCQ",
    ],
    "Extended_Abstract": [
        "FAR_TRANSFER", "ANALOGY_FORWARD", "ANALOGY_SIMULATE",
        "ANALOGY_BREAKDOWN",
    ],
}


class ProbeGenerator:
    """Generates probe prompts via LLM structured output."""

    def __init__(self, client: GenerationClient | None = None):
        self._client = client or get_generation_client()

    async def select_probe_type(
        self,
        solo_level: str,
        shape: str,
        attempted_types: list[str] | None = None,
    ) -> str:
        """Select an appropriate probe type based on SOLO level (§8).

        Avoids recently attempted types to ensure diversity
        (mastery condition 3: at least 2 distinct types).
        """
        import random

        eligible = SOLO_PROBE_MAP.get(solo_level, ["RECALL"])

        # Filter out recently attempted types
        if attempted_types:
            remaining = [t for t in eligible if t not in attempted_types]
            if remaining:
                eligible = remaining

        # For PROCEDURAL shape, prefer PROCEDURAL type
        if shape == "PROCEDURAL" and "PROCEDURAL" not in eligible:
            eligible.append("PROCEDURAL")

        return random.choice(eligible)

    async def generate_probe(
        self,
        concept: dict,
        claims: list[dict],
        probe_type: str,
    ) -> tuple[str, dict]:
        """Generate a probe prompt and answer key.

        Args:
            concept: concept dict with 'canonical_label', 'shape', etc.
            claims: list of claim dicts with 'text', 'order_index', etc.
            probe_type: one of the probe type enum values.

        Returns:
            (prompt_text, answer_key_snapshot): the generated prompt and
            the answer key for grading.
        """
        label = concept.get("canonical_label", "this concept")
        shape = concept.get("shape", "DEFINITION")
        claim_texts = [c["text"] for c in claims]

        # Build the template
        template = PROBE_TEMPLATES.get(probe_type, PROBE_TEMPLATES["RECALL"])
        base_prompt = template.format(label=label)

        # Build context for LLM
        context = (
            f"Concept: {label}\n"
            f"Shape: {shape}\n"
            f"Number of claims: {len(claim_texts)}\n\n"
            f"Claims for context (DO NOT reproduce these verbatim in the question):\n"
        )
        for i, ct in enumerate(claim_texts[:10], 1):
            context += f"  {i}. {ct}\n"

        system_prompt = (
            "You are generating a learning assessment probe. "
            "Generate ONLY the question text that the learner will see. "
            "Do NOT include the answer. Do NOT reproduce any claim verbatim — "
            "the question must test understanding, not recognition. "
            "Return JSON: {\"prompt_text\": \"...\"}"
        )

        # The previous transport set temperature=0.7 for variety. Claude Opus
        # 5.5 rejects sampling parameters; variety across leakage retries comes
        # from independent sampling at default settings.
        result = await self._client.generate_structured(
            system=system_prompt,
            prompt=f"{base_prompt}\n\n{context}",
            schema=PROBE_SCHEMA,
        )
        prompt_text = result.data.get("prompt_text") or f"Explain {label}."

        # Build answer key snapshot (the claims this probe grades against)
        answer_key = {
            "claims": claim_texts,
            "probe_type": probe_type,
            "concept_label": label,
            "shape": shape,
        }

        return prompt_text, answer_key
