"""Process template management (§8.4).

Process Templates define the canonical structure of a concept's claims:
trunk (main sequence) and branches (conditional paths).

Templates are used for:
- PERTURBATION probes (delta scoring, §5.12)
- PROCESS_TRACE probes (ordering)
- Structured grading (branch leakage, §5.7)

Template stability:
- tier: SOURCE_GROUNDED (from validated source) or GENERATED (LLM-only)
- confidence: stable (2+ runs agree) or unstable
- disputed_count: number of disagreements between generation runs
- order_tau: Kendall τ between independent generation runs
"""
from __future__ import annotations

import logging

from app.providers.generation import GenerationClient, get_generation_client, strict_object

logger = logging.getLogger(__name__)

# Strict structured-output schemas cannot express a dynamic-key map, so
# branches travel as a list of {name, claim_indices} and are converted back to
# the {"branch_name": [indices]} dict the rest of this module stores.
TEMPLATE_SCHEMA = strict_object({
    "trunk": {"type": "array", "items": {"type": "integer"}},
    "branches": {
        "type": "array",
        "items": strict_object({
            "name": {"type": "string"},
            "claim_indices": {"type": "array", "items": {"type": "integer"}},
        }),
    },
})


class ProcessTemplateManager:
    """Manages process templates for concepts."""

    def __init__(self, client: GenerationClient | None = None):
        self._client = client or get_generation_client()

    async def get_or_generate_template(
        self,
        concept_id: str,
        concept_version: int,
        concept_label: str,
        claims: list[dict],
        conn=None,
    ) -> dict:
        """Get existing template or generate a new one.

        Checks DB first. If not found, generates via LLM,
        runs a second generation for agreement check, then persists.
        """
        if conn:
            from psycopg.rows import dict_row
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """SELECT * FROM process_templates
                       WHERE concept_id = %s AND concept_version = %s""",
                    (concept_id, concept_version),
                )
                existing = await cur.fetchone()

            if existing:
                return dict(existing)

        # Generate new template
        structure = await self._generate_template_structure(
            concept_label, claims,
        )

        # Run second generation for agreement
        structure_b = await self._generate_template_structure(
            concept_label, claims,
        )

        stable, disputed, tau = self._verify_agreement(structure, structure_b)

        template = {
            "concept_id": concept_id,
            "concept_version": concept_version,
            "tier": "GENERATED",
            "confidence": "stable" if stable else "unstable",
            "disputed_count": disputed,
            "order_tau": tau,
            "structure": structure,
            "deltas": {},
        }

        # Persist if we have a connection
        if conn:
            import psycopg.types.json
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO process_templates (
                        id, concept_id, concept_version, tier, confidence,
                        disputed_count, order_tau, structure, deltas
                    ) VALUES (
                        gen_random_uuid(), %s, %s, %s, %s,
                        %s, %s, %s::jsonb, %s::jsonb
                    ) ON CONFLICT (concept_id, concept_version) DO NOTHING""",
                    (
                        concept_id, concept_version,
                        template["tier"], template["confidence"],
                        disputed, tau,
                        psycopg.types.json.Jsonb(structure),
                        psycopg.types.json.Jsonb({}),
                    ),
                )
            await conn.commit()

        return template

    async def _generate_template_structure(
        self,
        concept_label: str,
        claims: list[dict],
    ) -> dict:
        """Generate a process template structure via LLM."""
        claim_texts = [c.get("text", "") for c in claims][:15]

        system_prompt = (
            "You are a knowledge engineer. Given a concept and its claims, "
            "organise them into a process template with:\n"
            "- trunk: the main ordered sequence of claims\n"
            "- branches: conditional paths (if any)\n\n"
            "Return JSON: {\"trunk\": [claim_indices], "
            "\"branches\": [{\"name\": \"branch_name\", \"claim_indices\": [...]}]}"
        )

        content = f"Concept: {concept_label}\n\nClaims:\n"
        for i, ct in enumerate(claim_texts):
            content += f"  {i}. {ct}\n"

        # Two independent calls feed _verify_agreement (generate-twice-agree).
        # Default sampling keeps them independent; the old temperature=0.3 is
        # dropped because Claude Opus 5.5 rejects sampling parameters.
        result = await self._client.generate_structured(
            system=system_prompt,
            prompt=content,
            schema=TEMPLATE_SCHEMA,
        )
        return {
            "trunk": [i for i in result.data.get("trunk", []) if isinstance(i, int)],
            "branches": {
                b["name"]: [i for i in b.get("claim_indices", []) if isinstance(i, int)]
                for b in result.data.get("branches", [])
                if isinstance(b, dict) and b.get("name")
            },
        }

    @staticmethod
    def _verify_agreement(
        structure_a: dict,
        structure_b: dict,
    ) -> tuple[bool, int, float]:
        """Verify agreement between two independently generated templates.

        Returns:
            (stable, disputed_count, order_tau)
        """
        trunk_a = structure_a.get("trunk", [])
        trunk_b = structure_b.get("trunk", [])

        # Count disagreements
        disputed = 0
        for idx in set(trunk_a) | set(trunk_b):
            if idx not in trunk_a or idx not in trunk_b:
                disputed += 1

        # Compute ordering agreement (simplified tau)
        common = [x for x in trunk_a if x in trunk_b]
        if len(common) >= 2:
            from app.grading.ordering import calculate_kendall_tau_b
            order_a = [trunk_a.index(x) for x in common]
            order_b = [trunk_b.index(x) for x in common]
            tau = calculate_kendall_tau_b(order_a, order_b)
            tau = tau if tau is not None else 0.0
        else:
            tau = 0.0

        stable = disputed <= 1 and (tau is None or tau >= 0.8)

        return stable, disputed, tau
