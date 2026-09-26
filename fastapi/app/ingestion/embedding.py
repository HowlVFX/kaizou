"""Embedding service facade (§5.1).

Provides text → unit vector(1536) for claim matching, concept identity,
semantic linking, and probe-leakage checks. The transport lives in
``app.providers.embeddings`` (gemini-embedding-2); this module keeps the
interface the domain code already depends on.

🔒 Sentence-level embeddings only — claims are sentence-shaped objects.
🔒 Every stored vector uses the same task prefix (semantic similarity), so
   all pgvector columns stay directly comparable.
"""
from __future__ import annotations

import logging

from app.providers.embeddings import EmbeddingTask, GeminiEmbeddingClient, get_embedding_client

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Facade for embedding operations used by ingestion, grading, and probes."""

    def __init__(self, client: GeminiEmbeddingClient):
        self._client = client

    @property
    def dimensions(self) -> int:
        return self._client.dimensions

    async def compute_embedding(self, text: str) -> list[float]:
        """Compute embedding for a single text."""
        return await self._client.embed_one(text, EmbeddingTask.SEMANTIC_SIMILARITY)

    async def compute_batch_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Compute embeddings for a batch of texts (order preserved)."""
        if not texts:
            return []
        return await self._client.embed(texts, EmbeddingTask.SEMANTIC_SIMILARITY)


def create_embedding_service(settings=None) -> EmbeddingService:
    """Build the configured embedding service from Settings.

    Raises ProviderConfigError with setup instructions if GEMINI_API_KEY is
    missing.
    """
    return EmbeddingService(get_embedding_client(settings))
