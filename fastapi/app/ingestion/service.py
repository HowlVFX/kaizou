"""Ingestion pipeline orchestrator (§4.4–4.6, §8.1).

Full pipeline for a note:
  1. Classify: track, shape, category, Bloom level
  2. Extract claims from the note body
  3. Compute embeddings for the concept label and each claim
  4. Resolve concept identity (new vs existing, §4.6)
  5. Deduplicate claims against existing concept claims
  6. Create/update concept in DB
  7. Extract prerequisites and wikilinks
  8. Create edges (WIKILINK, SEMANTIC, REQUIRES)
  9. Compute structural complexity
  10. Update note status to READY
"""
from __future__ import annotations

import hashlib
import logging
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row

from app.ingestion.classifier import NoteClassifier, ClassificationResult
from app.ingestion.embedding import EmbeddingService
from app.ingestion.extractor import ClaimExtractor, extract_wikilinks
from app.ingestion.identity import (
    resolve_concept_identity,
    deduplicate_claims,
)
from app.graph.linking import find_semantic_neighbours
from app.memory.mastery import (
    compute_structural_complexity,
    compute_initial_complexity,
)
from app.memory.decay import calculate_initial_half_life

logger = logging.getLogger(__name__)


class IngestionService:
    """Orchestrates the full note ingestion pipeline."""

    def __init__(
        self,
        conn: psycopg.AsyncConnection,
        classifier: NoteClassifier | None = None,
        extractor: ClaimExtractor | None = None,
        embedding_service: EmbeddingService | None = None,
    ):
        self._conn = conn
        self._classifier = classifier
        self._extractor = extractor
        self._embedding = embedding_service

    async def ingest_note(self, note_id: str, learner_id: str) -> dict:
        """Run the full ingestion pipeline for a note.
        
        Returns dict with concept_id, claims_count, status.
        """
        # 1. Fetch the note
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT * FROM notes WHERE id = %s AND learner_id = %s",
                (note_id, learner_id),
            )
            note = await cur.fetchone()

        if not note:
            raise ValueError(f"Note {note_id} not found for learner {learner_id}")

        body = note["body_md"] or note.get("body", "")
        title = note["title"]

        try:
            # 2. Check if content changed (skip if hash matches)
            content_hash = hashlib.sha256(body.encode()).hexdigest()
            if note.get("markdown_hash") == content_hash:
                logger.info("Note %s unchanged, skipping ingestion", note_id)
                return {"concept_id": None, "claims_count": 0, "status": "UNCHANGED"}

            # 3. Classify the note
            classification = await self._classifier.classify(body)

            # 4. Extract claims
            claims = await self._extractor.extract_claims(body, classification.shape)

            # 5. Compute embeddings
            label_embedding = await self._embedding.compute_embedding(title)
            claim_texts = [c.text for c in claims]
            claim_embeddings = await self._embedding.compute_batch_embeddings(claim_texts)

            # 6. Resolve concept identity
            async with self._conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT id, canonical_label AS label, label_embedding AS embedding "
                    "FROM concepts WHERE learner_id = %s AND label_embedding IS NOT NULL",
                    (learner_id,),
                )
                existing_concepts = await cur.fetchall()

            identity = resolve_concept_identity(
                label_embedding,
                [dict(c) for c in existing_concepts],
            )

            # 7. Create or update concept
            if identity.is_new:
                concept_id = str(uuid4())
                # Compute complexity
                token_count = len(body.split())
                c_struct = compute_structural_complexity(len(claims), 0, token_count)
                c_0 = compute_initial_complexity(c_struct, classification.bloom_level)
                h_0 = calculate_initial_half_life(c_0)

                async with self._conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO concepts (
                            id, learner_id, canonical_label, label_embedding,
                            track, shape, category, status, version,
                            c_struct, c_bloom, c_0, c_current, solo_level,
                            source_trust_tier
                        ) VALUES (
                            %s, %s, %s, %s::vector,
                            %s, %s, %s, 'VERIFIED_CONCEPT', 1,
                            %s, %s, %s, %s, 'Prestructural',
                            NULL
                        )
                        """,
                        (
                            concept_id, learner_id, title, str(label_embedding),
                            classification.track, classification.shape,
                            classification.category,
                            c_struct, classification.bloom_level, c_0, c_0,
                        ),
                    )

                    # Create initial memory state
                    await cur.execute(
                        """
                        INSERT INTO memory_states (concept_id, learner_id, half_life)
                        VALUES (%s, %s, %s)
                        ON CONFLICT DO NOTHING
                        """,
                        (concept_id, learner_id, h_0),
                    )
            else:
                concept_id = identity.concept_id
                # Bump version
                async with self._conn.cursor() as cur:
                    await cur.execute(
                        "UPDATE concepts SET version = version + 1 WHERE id = %s RETURNING version",
                        (concept_id,),
                    )
                    row = await cur.fetchone()
                    version = row[0] if row else 1

            # 8. Insert claims (deduplicated)
            async with self._conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT text, embedding FROM claims WHERE concept_id = %s",
                    (concept_id,),
                )
                existing_claims_raw = await cur.fetchall()

            existing_claim_dicts = [
                {"text": c["text"], "embedding": c["embedding"]}
                for c in existing_claims_raw
            ]
            new_claim_dicts = [
                {"text": c.text, "embedding": emb}
                for c, emb in zip(claims, claim_embeddings)
            ]
            unique_claims = deduplicate_claims(new_claim_dicts, existing_claim_dicts)

            # Get current version
            async with self._conn.cursor() as cur:
                await cur.execute(
                    "SELECT version FROM concepts WHERE id = %s", (concept_id,)
                )
                row = await cur.fetchone()
                version = row[0] if row else 1

            # Insert unique claims
            for claim_dict in unique_claims:
                claim_obj = next(
                    (c for c in claims if c.text == claim_dict["text"]), None
                )
                if not claim_obj:
                    continue

                async with self._conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO claims (
                            id, concept_id, concept_version, text, embedding,
                            order_index, is_transition, is_load_bearing,
                            branch_id, weight, aliases
                        ) VALUES (
                            gen_random_uuid(), %s, %s, %s, %s::vector,
                            %s, %s, %s, %s, 1.0, %s
                        )
                        """,
                        (
                            concept_id, version, claim_obj.text,
                            str(claim_dict["embedding"]),
                            claim_obj.order_index, claim_obj.is_transition,
                            claim_obj.is_load_bearing, claim_obj.branch_id,
                            claim_obj.aliases,
                        ),
                    )

            # 9. Link note to concept
            async with self._conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO note_concepts (note_id, concept_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (note_id, concept_id),
                )

            # 10. Extract wikilinks and create edges
            wikilinks = extract_wikilinks(body)
            for target_label in wikilinks:
                async with self._conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute(
                        "SELECT id FROM concepts WHERE learner_id = %s AND LOWER(canonical_label) = LOWER(%s)",
                        (learner_id, target_label),
                    )
                    target = await cur.fetchone()
                    if target:
                        await cur.execute(
                            """
                            INSERT INTO edges (id, learner_id, source_id, target_id, type, weight)
                            VALUES (gen_random_uuid(), %s, %s, %s, 'WIKILINK', 1.0)
                            ON CONFLICT (source_id, target_id, type) DO NOTHING
                            """,
                            (learner_id, concept_id, target["id"]),
                        )

            # 11. Create semantic edges
            semantic_neighbours = find_semantic_neighbours(
                label_embedding,
                [dict(c) for c in existing_concepts if c["id"] != concept_id],
            )
            for neighbour in semantic_neighbours:
                async with self._conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO edges (id, learner_id, source_id, target_id, type, weight, confidence)
                        VALUES (gen_random_uuid(), %s, %s, %s, 'SEMANTIC', %s, %s)
                        ON CONFLICT (source_id, target_id, type) DO NOTHING
                        """,
                        (
                            learner_id, concept_id, neighbour["concept_id"],
                            neighbour["similarity"], neighbour["similarity"],
                        ),
                    )

            # 12. Update note status
            async with self._conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE notes
                    SET ingestion_status = 'READY',
                        markdown_hash = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (content_hash, note_id),
                )

            await self._conn.commit()

            return {
                "concept_id": concept_id,
                "claims_count": len(unique_claims),
                "status": "READY",
                "is_new_concept": identity.is_new,
            }

        except Exception as e:
            # Mark note as failed
            logger.error("Ingestion failed for note %s: %s", note_id, e, exc_info=True)
            async with self._conn.cursor() as cur:
                await cur.execute(
                    "UPDATE notes SET ingestion_status = 'FAILED' WHERE id = %s",
                    (note_id,),
                )
            await self._conn.commit()
            raise