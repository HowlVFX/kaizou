"""Reuse cache for paid provider results (DB-backed, no Redis).

A cache hit avoids both the network call and the budget spend. Keys are
sha256 hashes of the inputs that determine the output, so any change to those
inputs produces a new key and the old entry is simply never read again
(automatic invalidation).

Key composition:
- generation: task, model, prompt_version, content_version, params, schema
- embedding:  normalized text, model, dimensions
- nli:        premise, hypothesis, model, revision, preprocessing_version

🔒 Only hashed keys and the structured result are stored — the cache never
persists raw note/answer text as a readable column (the hash is one-way).

Degrades safely: with no DB pool, every lookup is a miss and every put a
no-op, so callers still function.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _hash(*parts: Any) -> str:
    payload = json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def normalize_text(text: str) -> str:
    """Whitespace-collapsed, stripped form so trivially different inputs share a key."""
    return " ".join(text.split())


def generation_key(*, task: str, model: str, prompt_version: str,
                   content_version: str, params: dict, schema: dict,
                   system: str, prompt: str, variant: str = "") -> str:
    """Key for a generation result.

    ``system`` and ``prompt`` are part of the key: two calls only share a
    cached answer when they are genuinely the same request. ``variant`` lets a
    caller ask for a deliberately independent sample of the same request (the
    template generate-twice agreement check, probe leakage retries).
    """
    return _hash("generation", task, model, prompt_version, content_version,
                 params, json.dumps(schema, sort_keys=True),
                 system, prompt, variant)


def embedding_key(*, text: str, model: str, dimensions: int) -> str:
    return _hash("embedding", model, dimensions, normalize_text(text))


def nli_key(*, premise: str, hypothesis: str, model: str, revision: str,
            preprocessing_version: str) -> str:
    return _hash("nli", model, revision, preprocessing_version,
                 normalize_text(premise), normalize_text(hypothesis))


class AICache:
    """get/put structured results keyed by hash."""

    def __init__(self, conn=None, *, settings=None):
        if settings is None:
            from app.config import get_settings
            settings = get_settings()
        self._conn = conn
        self._s = settings

    @property
    def enabled(self) -> bool:
        return self._s.ai_cache_enabled and self._conn is not None

    async def get(self, kind: str, key_hash: str) -> Any | None:
        if not self.enabled:
            return None
        # Read by name so it works under any default row factory (pool=dict_row).
        from psycopg.rows import dict_row
        async with self._conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT value_json FROM ai_cache WHERE kind = %s AND key_hash = %s",
                (kind, key_hash),
            )
            row = await cur.fetchone()
            if row is None:
                return None
            await cur.execute(
                "UPDATE ai_cache SET hits = hits + 1, last_used_at = NOW() "
                "WHERE kind = %s AND key_hash = %s",
                (kind, key_hash),
            )
        await self._conn.commit()
        return row["value_json"]

    async def put(self, kind: str, key_hash: str, model: str, value: Any) -> None:
        if not self.enabled:
            return
        import psycopg.types.json
        async with self._conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO ai_cache (kind, key_hash, model, value_json)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (kind, key_hash) DO NOTHING""",
                (kind, key_hash, model, psycopg.types.json.Jsonb(value)),
            )
        await self._conn.commit()
