"""Retrieval service — orchestrates source discovery and validation (§10)."""
from __future__ import annotations

import logging
from typing import Optional

import psycopg
from psycopg.rows import dict_row

from app.retrieval.fetcher import fetch_url
from app.retrieval.search import WebSearchService, classify_trust_tier

logger = logging.getLogger(__name__)


class RetrievalService:
    """Orchestrates source retrieval, storage, and validation."""

    def __init__(
        self,
        conn: psycopg.AsyncConnection,
        search_service: WebSearchService | None = None,
    ):
        self._conn = conn
        self._search = search_service or WebSearchService()

    async def find_and_store_sources(
        self,
        concept_id: str,
        concept_label: str,
        claims: list[str],
        preferred_tiers: list[str] | None = None,
    ) -> list[dict]:
        """Search for sources, fetch content, and store in DB."""
        results = await self._search.search_for_concept(
            concept_label, claims, preferred_tiers,
        )

        stored: list[dict] = []
        for result in results[:5]:  # Limit to top 5
            try:
                fetched = await fetch_url(result['url'])
                trust_tier = classify_trust_tier(result['domain'])

                async with self._conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute(
                        """INSERT INTO sources (
                            id, concept_id, url, domain, trust_tier,
                            content_sha256, token_count, raw_text
                        ) VALUES (
                            gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s
                        )
                        ON CONFLICT (url) DO UPDATE SET
                            content_sha256 = EXCLUDED.content_sha256,
                            token_count = EXCLUDED.token_count
                        RETURNING id""",
                        (
                            concept_id, result['url'], result['domain'],
                            trust_tier, fetched['content_hash'],
                            fetched['token_count'], fetched['content'][:50000],
                        ),
                    )
                    row = await cur.fetchone()

                stored.append({
                    'source_id': str(row['id']),
                    'url': result['url'],
                    'domain': result['domain'],
                    'trust_tier': trust_tier,
                })
            except Exception as e:
                logger.warning('Failed to fetch %s: %s', result['url'], e)

        if stored:
            await self._conn.commit()

        return stored

    async def get_sources_for_concept(
        self, concept_id: str,
    ) -> list[dict]:
        """Get all stored sources for a concept."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT id, url, domain, trust_tier, content_sha256, token_count
                   FROM sources WHERE concept_id = %s
                   ORDER BY trust_tier ASC""",
                (concept_id,),
            )
            rows = await cur.fetchall()
        return [dict(r) for r in rows]