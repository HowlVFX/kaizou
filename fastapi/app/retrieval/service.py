"""Retrieval service — orchestrates source discovery and validation (§10)."""
from __future__ import annotations

import logging
from typing import Optional

import psycopg
from psycopg.rows import dict_row

from app.retrieval.fetcher import fetch_url
from app.retrieval.search import WebSearchService, classify_trust_tier

logger = logging.getLogger(__name__)


async def upsert_source(
    conn: psycopg.AsyncConnection,
    *,
    concept_id: str,
    url: str,
    domain: str,
    trust_tier: str,
    content_sha256: str,
    content_text: str,
) -> str:
    """Insert or refresh a source row for (concept_id, url). Returns its id.

    ``sources`` has no unique constraint on url (the same page can back
    several concepts), so the upsert is done by lookup rather than
    ON CONFLICT. Caller commits.
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id FROM sources WHERE concept_id = %s AND url = %s LIMIT 1",
            (concept_id, url),
        )
        existing = await cur.fetchone()
        if existing:
            await cur.execute(
                """UPDATE sources
                   SET content_sha256 = %s, content_text = %s,
                       trust_tier = %s::source_trust_tier, fetched_at = NOW()
                   WHERE id = %s""",
                (content_sha256, content_text, trust_tier, existing["id"]),
            )
            return str(existing["id"])

        await cur.execute(
            """INSERT INTO sources (
                   concept_id, url, domain, trust_tier,
                   content_sha256, content_text
               ) VALUES (%s, %s, %s, %s::source_trust_tier, %s, %s)
               RETURNING id""",
            (concept_id, url, domain, trust_tier, content_sha256, content_text),
        )
        row = await cur.fetchone()
        return str(row["id"])


class RetrievalService:
    """Orchestrates source retrieval, storage, and validation."""

    def __init__(
        self,
        conn: psycopg.AsyncConnection,
        search_service: WebSearchService | None = None,
    ):
        self._conn = conn
        self._search = search_service or WebSearchService.from_settings()

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

                # Savepoint: one bad row must not abort the whole batch's transaction.
                async with self._conn.transaction():
                    source_id = await upsert_source(
                        self._conn,
                        concept_id=concept_id,
                        url=result['url'],
                        domain=result['domain'],
                        trust_tier=trust_tier,
                        content_sha256=fetched['content_hash'],
                        content_text=fetched['content'][:50000],
                    )

                stored.append({
                    'source_id': source_id,
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
                """SELECT id, url, domain, trust_tier, content_sha256, fetched_at
                   FROM sources WHERE concept_id = %s
                   ORDER BY trust_tier ASC""",
                (concept_id,),
            )
            rows = await cur.fetchall()
        # Enum order is PEER_REVIEWED < INSTITUTIONAL < GENERAL, so ASC = most trusted first.
        return [{**r, 'id': str(r['id'])} for r in rows]