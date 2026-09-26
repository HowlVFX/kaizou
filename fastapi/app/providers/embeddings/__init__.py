"""Embedding provider: Google gemini-embedding-2 at 1536 dimensions."""
from app.providers.embeddings.gemini import (
    EmbeddingTask,
    GeminiEmbeddingClient,
    check_embedding_provider,
    get_embedding_client,
)

__all__ = [
    "EmbeddingTask",
    "GeminiEmbeddingClient",
    "check_embedding_provider",
    "get_embedding_client",
]
