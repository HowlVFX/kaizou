"""Google Gemini embeddings (``gemini-embedding-2``).

Wire format (verified against Google docs, 2026-09-26):
    POST https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents
    {"requests": [{"model": "models/{model}",
                   "content": {"parts": [{"text": "..."}]},
                   "output_dimensionality": 1536}, ...]}
    → {"embeddings": [{"values": [...]}, ...]}   # one per request, in order

Notes that matter for this project:
- One ``request`` per text. Putting several parts in one content object makes
  gemini-embedding-2 return a single *aggregated* vector.
- gemini-embedding-2 has no ``task_type`` parameter; the task is expressed as
  a text prefix. Every vector stored in pgvector uses the same symmetric
  prefix (``task: sentence similarity``) so all stored vectors are directly
  comparable. Mixing prefixes across stored vectors would silently skew
  cosine similarity.
- Truncated (MRL) outputs such as 1536 are auto-normalised by the API; we
  L2-normalise again defensively (idempotent) and enforce the dimension.
- Input limit is 8,192 tokens per text.
"""
from __future__ import annotations

import logging
import math
import time
from enum import Enum
from typing import Sequence

import httpx

from app.providers.shared.errors import ProviderResponseError, missing_key_error
from app.providers.shared.http import post_json
from app.providers.shared.types import HealthCheckResult, Usage, usage_int

logger = logging.getLogger(__name__)

BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
ENV_VAR = "GEMINI_API_KEY"
GET_KEY = "https://aistudio.google.com/apikey (Google AI Studio)"
MAX_BATCH = 100  # requests per batchEmbedContents call


class EmbeddingTask(str, Enum):
    """Symmetric task prefixes documented for gemini-embedding-2.

    Only SEMANTIC_SIMILARITY is used for stored vectors (claims, concept
    labels, probe-leakage checks). The others exist for ad-hoc experiments
    and must not be mixed into pgvector columns.
    """
    SEMANTIC_SIMILARITY = "sentence similarity"
    CLUSTERING = "clustering"
    CLASSIFICATION = "classification"


def format_input(text: str, task: EmbeddingTask) -> str:
    return f"task: {task.value} | query: {text}"


def _l2_normalise(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vector))
    return [v / norm for v in vector] if norm else vector


def _check_finite(provider: str, values: list[float]) -> None:
    """Reject NaN/inf before a vector reaches pgvector or cosine math."""
    if any(not math.isfinite(v) for v in values):
        raise ProviderResponseError(provider, "embedding contains non-finite values (NaN/inf)")


class GeminiEmbeddingClient:
    provider_label = "gemini"

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gemini-embedding-2",
        dimensions: int = 1536,
        timeout_seconds: float = 60.0,
        max_retries: int = 3,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        if not api_key:
            raise missing_key_error(self.provider_label, ENV_VAR, GET_KEY)
        self._api_key = api_key
        self.model = model
        self.dimensions = dimensions
        self._timeout = timeout_seconds
        self._max_retries = max_retries
        self._transport = transport

    async def embed(
        self,
        texts: Sequence[str],
        task: EmbeddingTask = EmbeddingTask.SEMANTIC_SIMILARITY,
    ) -> list[list[float]]:
        """Embed each text into a unit vector of ``self.dimensions`` floats."""
        if not texts:
            return []
        vectors: list[list[float]] = []
        for start in range(0, len(texts), MAX_BATCH):
            vectors.extend(await self._embed_chunk(texts[start:start + MAX_BATCH], task))
        return vectors

    async def embed_one(
        self, text: str, task: EmbeddingTask = EmbeddingTask.SEMANTIC_SIMILARITY,
    ) -> list[float]:
        return (await self.embed([text], task))[0]

    async def _embed_chunk(self, texts: Sequence[str], task: EmbeddingTask) -> list[list[float]]:
        vectors, _usage = await self.embed_chunk_with_usage(texts, task)
        return vectors

    async def embed_chunk_with_usage(
        self, texts: Sequence[str], task: EmbeddingTask = EmbeddingTask.SEMANTIC_SIMILARITY,
    ) -> tuple[list[list[float]], Usage]:
        """One batchEmbedContents call (≤ MAX_BATCH texts) plus its usage.

        Usage comes from ``usageMetadata.promptTokenCount`` (documented on the
        BatchEmbedContentsResponse, ai.google.dev/api/embeddings, checked
        2026-09-26). When absent it is estimated from text length and flagged.
        Errors raised after the response arrived carry the usage.
        """
        if len(texts) > MAX_BATCH:
            raise ValueError(f"at most {MAX_BATCH} texts per chunk, got {len(texts)}")
        model_ref = f"models/{self.model}"
        inputs = [format_input(t, task) for t in texts]
        payload = {
            "requests": [
                {
                    "model": model_ref,
                    "content": {"parts": [{"text": text}]},
                    "output_dimensionality": self.dimensions,
                }
                for text in inputs
            ]
        }
        body = await post_json(
            provider=self.provider_label,
            url=f"{BASE_URL}/{self.model}:batchEmbedContents",
            headers={"x-goog-api-key": self._api_key},
            payload=payload,
            key_hint=ENV_VAR,
            timeout_seconds=self._timeout,
            max_retries=self._max_retries,
            transport=self._transport,
        )
        if not isinstance(body, dict):
            raise ProviderResponseError(self.provider_label, f"expected a JSON object, got {type(body).__name__}")
        usage = parse_embedding_usage(body, inputs)

        embeddings = body.get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise ProviderResponseError(
                self.provider_label,
                f"expected {len(texts)} embeddings, got "
                f"{len(embeddings) if isinstance(embeddings, list) else 'none'}",
                usage=usage,
            )
        out: list[list[float]] = []
        for item in embeddings:
            values = item.get("values") if isinstance(item, dict) else None
            if not isinstance(values, list) or len(values) != self.dimensions:
                raise ProviderResponseError(
                    self.provider_label,
                    f"embedding has {len(values) if isinstance(values, list) else 0} dims; "
                    f"expected {self.dimensions} (EMBEDDING_DIMENSIONS must match the "
                    f"vector({self.dimensions}) columns in database/schema.sql)",
                    usage=usage,
                )
            try:
                floats = [float(v) for v in values]
                _check_finite(self.provider_label, floats)
            except ProviderResponseError as exc:
                exc.usage = usage
                raise
            except (TypeError, ValueError) as exc:
                raise ProviderResponseError(
                    self.provider_label, "embedding contains non-numeric values", usage=usage,
                ) from exc
            out.append(_l2_normalise(floats))
        return out, usage


def parse_embedding_usage(body: dict, inputs: Sequence[str]) -> Usage:
    """Billed input tokens for a batchEmbedContents response.

    Documented field: ``usageMetadata.promptTokenCount`` (the snake_case
    ``usage_metadata.prompt_token_count`` is accepted too). Missing →
    estimate from text length (~4 chars/token) with a warning.
    """
    raw = body.get("usageMetadata") or body.get("usage_metadata") or {}
    tokens = usage_int(raw, "promptTokenCount", "prompt_token_count")
    if tokens is not None:
        return Usage(input_tokens=tokens, output_tokens=0)
    logger.warning("gemini embedding response has no usageMetadata; estimating tokens from text length")
    return Usage(
        input_tokens=sum(max(1, math.ceil(len(t) / 4)) for t in inputs),
        output_tokens=0,
        estimated=True,
    )


def get_embedding_client(settings=None, **overrides) -> GeminiEmbeddingClient:
    if settings is None:
        from app.config import get_settings
        settings = get_settings()
    return GeminiEmbeddingClient(
        api_key=settings.gemini_api_key,
        model=settings.embedding_model,
        dimensions=settings.embedding_dimensions,
        timeout_seconds=min(settings.provider_timeout_seconds, 60.0),
        max_retries=settings.provider_max_retries,
        **overrides,
    )


async def check_embedding_provider(settings=None, **overrides) -> HealthCheckResult:
    """Embed two short sentences; confirms key, model, and dimensionality."""
    client = get_embedding_client(settings, **overrides)
    started = time.perf_counter()
    a, b = await client.embed(["Water boils at 100 °C.", "El agua hierve a 100 °C."])
    latency = (time.perf_counter() - started) * 1000
    cross_lingual_sim = sum(x * y for x, y in zip(a, b))
    return HealthCheckResult(
        role="embeddings",
        provider=client.provider_label,
        model=client.model,
        ok=True,
        latency_ms=latency,
        detail=f"dims={len(a)}, en<->es cosine={cross_lingual_sim:.3f}",
    )
