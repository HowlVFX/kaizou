"""Source content snapshotting for change detection (§10.3).

Periodically re-fetches sources to detect if content has changed.
If a source changes, the concept's claims may need re-validation.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

from app.retrieval.fetcher import fetch_url

logger = logging.getLogger(__name__)


class SnapshotService:
    """Manages source content snapshots."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self._conn = conn

    async def check_for_changes(
        self, source_id: str,
    ) -> dict:
        """Re-fetch a source and check if content has changed.

        Returns dict: {changed: bool, old_hash: str, new_hash: str}
        """
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                'SELECT url, content_sha256 FROM sources WHERE id = %s',
                (source_id,),
            )
            source = await cur.fetchone()

        if not source:
            raise ValueError(f'Source {source_id} not found')

        old_hash = source['content_sha256']

        try:
            fetched = await fetch_url(source['url'])
            new_hash = fetched['content_hash']
        except Exception as e:
            logger.warning('Failed to re-fetch %s: %s', source['url'], e)
            return {'changed': False, 'old_hash': old_hash, 'new_hash': old_hash, 'error': str(e)}

        changed = old_hash != new_hash

        if changed:
            async with self._conn.cursor() as cur:
                await cur.execute(
                    """UPDATE sources
                       SET content_sha256 = %s,
                           token_count = %s,
                           raw_text = %s,
                           last_checked = NOW()
                       WHERE id = %s""",
                    (new_hash, fetched['token_count'],
                     fetched['content'][:50000], source_id),
                )
            await self._conn.commit()
            logger.info('Source %s content changed', source_id)
        else:
            async with self._conn.cursor() as cur:
                await cur.execute(
                    'UPDATE sources SET last_checked = NOW() WHERE id = %s',
                    (source_id,),
                )
            await self._conn.commit()

        return {'changed': changed, 'old_hash': old_hash, 'new_hash': new_hash}

    async def check_all_sources(
        self, max_age_days: int = 7,
    ) -> list[dict]:
        """Check all sources not checked within max_age_days."""
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """SELECT id FROM sources
                   WHERE last_checked IS NULL
                      OR last_checked < NOW() - INTERVAL '%s days'
                   ORDER BY last_checked ASC NULLS FIRST
                   LIMIT 50""",
                (max_age_days,),
            )
            sources = await cur.fetchall()

        results = []
        for source in sources:
            try:
                result = await self.check_for_changes(str(source['id']))
                result['source_id'] = str(source['id'])
                results.append(result)
            except Exception as e:
                logger.warning('Snapshot check failed for %s: %s', source['id'], e)

        return results