"""Probe service — orchestrates probe lifecycle (§8).

Coordinates probe generation, leakage checking, grading,
and SOLO level advancement.
"""
from __future__ import annotations

import logging
from typing import Optional

import psycopg
from psycopg.rows import dict_row

from app.probes.generation import ProbeGenerator
from app.probes.leakage import validate_probe
from app.memory.telemetry import evaluate_solo_advancement

logger = logging.getLogger(__name__)

MAX_LEAKAGE_RETRIES = 3


class ProbeService:
    """Orchestrates probe generation, validation, and grading."""

    def __init__(
        self,
        conn: psycopg.AsyncConnection,
        generator: ProbeGenerator | None = None,
        embedding_service=None,
    ):
        self._conn = conn
        self._generator = generator
        self._embedding = embedding_service

    async def generate_probe_for_concept(
        self,
        concept_id: str,
        learner_id: str,
        probe_type: str | None = None,
    ) -> dict:
        """Generate a probe for a concept with leakage retry logic.

        Pipeline:
            1. Fetch concept + claims
            2. Select probe type based on SOLO level
            3. Generate prompt via LLM
            4. Check for leakage
            5. Retry up to 3 times if leaked
            6. Persist and return
        """
        # Fetch concept
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                'SELECT * FROM concepts WHERE id = %s', (concept_id,),
            )
            concept = await cur.fetchone()

        if not concept:
            raise ValueError(f'Concept {concept_id} not found')

        # Fetch claims
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT text, embedding, order_index, is_transition,
                          is_load_bearing, branch_id, aliases
                   FROM claims
                   WHERE concept_id = %s AND concept_version = %s
                   ORDER BY order_index ASC NULLS LAST""",
                (concept_id, concept['version']),
            )
            claims = await cur.fetchall()

        if not claims:
            raise ValueError(f'No claims for concept {concept_id}')

        # Select probe type
        if not probe_type:
            # Get recently attempted types
            async with self._conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """SELECT DISTINCT p.type FROM probes p
                       JOIN attempts a ON a.probe_id = p.id
                       WHERE a.learner_id = %s AND p.concept_id = %s
                       ORDER BY p.type
                       LIMIT 10""",
                    (learner_id, concept_id),
                )
                recent = await cur.fetchall()

            recent_types = [r['type'] for r in recent]
            probe_type = await self._generator.select_probe_type(
                concept.get('solo_level', 'Prestructural'),
                concept.get('shape', 'DEFINITION'),
                recent_types,
            )

        # Generate with leakage retry
        claim_dicts = [dict(c) for c in claims]
        claim_embeddings = [c['embedding'] for c in claims if c.get('embedding')]
        claim_texts = [c['text'] for c in claims]
        claim_token_lists = [t.split() for t in claim_texts]

        prompt_text = None
        answer_key = None
        is_valid = False
        retries = 0

        for attempt in range(MAX_LEAKAGE_RETRIES):
            prompt_text, answer_key = await self._generator.generate_probe(
                concept=dict(concept),
                claims=claim_dicts,
                probe_type=probe_type,
            )

            # Check leakage
            if self._embedding and claim_embeddings:
                probe_emb = await self._embedding.compute_embedding(prompt_text)
                is_valid, _, _ = validate_probe(
                    probe_emb, prompt_text.split(),
                    claim_embeddings, claim_token_lists,
                )
            else:
                is_valid = True  # Skip leakage check if no embeddings

            retries = attempt
            if is_valid:
                break

        # Persist probe
        import psycopg.types.json
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """INSERT INTO probes (
                    id, concept_id, concept_version, type,
                    prompt_text, answer_key_snapshot, leaked, retries
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s,
                    %s, %s::jsonb, %s, %s
                ) RETURNING id""",
                (
                    concept_id, concept['version'], probe_type,
                    prompt_text, psycopg.types.json.Jsonb(answer_key),
                    not is_valid, retries,
                ),
            )
            row = await cur.fetchone()

        await self._conn.commit()

        return {
            'probe_id': str(row['id']),
            'prompt_text': prompt_text,
            'probe_type': probe_type,
            'leaked': not is_valid,
            'retries': retries,
        }

    async def update_solo_level(
        self,
        concept_id: str,
        learner_id: str,
    ) -> str:
        """Re-evaluate and update SOLO level after grading."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            # Get concept current state
            await cur.execute(
                'SELECT solo_level FROM concepts WHERE id = %s',
                (concept_id,),
            )
            concept = await cur.fetchone()
            current_level = concept['solo_level'] if concept else 'Prestructural'

            # Count total claims matched across all attempts
            await cur.execute(
                """SELECT COUNT(*) as total_matched
                   FROM attempts a
                   WHERE a.concept_id = %s AND a.learner_id = %s AND a.passed = true""",
                (concept_id, learner_id),
            )
            row = await cur.fetchone()
            total_matched = row['total_matched'] if row else 0

            # Check transition claims
            await cur.execute(
                """SELECT COUNT(DISTINCT p.type) as distinct_types
                   FROM attempts a
                   JOIN probes p ON p.id = a.probe_id
                   WHERE a.concept_id = %s AND a.learner_id = %s
                     AND a.passed = true AND a.coverage >= 0.85""",
                (concept_id, learner_id),
            )
            row = await cur.fetchone()
            distinct_types = row['distinct_types'] if row else 0

        new_level = evaluate_solo_advancement(
            current_level=current_level,
            total_claims_matched=total_matched,
            transition_claims_all_matched=total_matched >= 3,
            distinct_probe_types_with_transitions=distinct_types,
            has_passed_perturbation=False,  # TODO: check from attempts
            perturbation_delta=0.0,
            has_passed_far_transfer=False,
            far_transfer_score=0.0,
        )

        if new_level != current_level:
            async with self._conn.cursor() as cur:
                await cur.execute(
                    'UPDATE concepts SET solo_level = %s WHERE id = %s',
                    (new_level, concept_id),
                )
            await self._conn.commit()
            logger.info(
                'SOLO level advanced: %s -> %s for concept %s',
                current_level, new_level, concept_id,
            )

        return new_level
