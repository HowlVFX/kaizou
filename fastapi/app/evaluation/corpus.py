"""Seeded corpus loader for the evaluation harness (§14).

200-250 pre-authored notes covering a controlled domain.
Used to validate the ingestion pipeline, grading accuracy, and
memory scheduling against known ground truth.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

import psycopg

logger = logging.getLogger(__name__)


class SeededCorpusLoader:
    """Loads and manages the seeded evaluation corpus."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self._conn = conn

    async def load_corpus(
        self,
        corpus_dir: str,
        learner_id: str,
    ) -> int:
        """Load seeded corpus notes from a directory.
        
        Each note is a JSON file with:
        - title: str
        - body_md: str
        - expected_claims: list[dict] (for validation)
        - expected_track: str
        - expected_shape: str
        - expected_category: str
        - expected_bloom: float
        
        Returns the number of notes loaded.
        """
        corpus_path = Path(corpus_dir)
        if not corpus_path.exists():
            raise FileNotFoundError(f"Corpus directory not found: {corpus_dir}")

        note_files = sorted(corpus_path.glob("*.json"))
        count = 0

        for note_file in note_files:
            try:
                with open(note_file, 'r', encoding='utf-8') as f:
                    note_data = json.load(f)

                async with self._conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO notes (id, learner_id, title, body_md, ingestion_status)
                        VALUES (gen_random_uuid(), %s, %s, %s, 'PENDING')
                        ON CONFLICT DO NOTHING
                        """,
                        (learner_id, note_data["title"], note_data["body_md"]),
                    )
                count += 1
            except Exception as e:
                logger.warning("Failed to load %s: %s", note_file.name, e)

        await self._conn.commit()
        logger.info("Loaded %d corpus notes for learner %s", count, learner_id)
        return count

    async def verify_corpus_integrity(self, learner_id: str) -> dict:
        """Verify all corpus notes have been processed.
        
        Returns dict with counts by status.
        """
        async with self._conn.cursor() as cur:
            await cur.execute(
                """
                SELECT ingestion_status, COUNT(*) as count
                FROM notes
                WHERE learner_id = %s
                GROUP BY ingestion_status
                """,
                (learner_id,),
            )
            rows = await cur.fetchall()

        # Pool connections use dict_row, so index by column name.
        status_counts = {row["ingestion_status"]: row["count"] for row in rows}
        total = sum(status_counts.values())

        return {
            "total": total,
            "pending": status_counts.get("PENDING", 0),
            "ready": status_counts.get("READY", 0),
            "failed": status_counts.get("FAILED", 0),
            "all_processed": status_counts.get("PENDING", 0) == 0,
        }
