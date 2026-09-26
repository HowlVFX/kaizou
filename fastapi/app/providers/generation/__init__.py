"""Generation provider: primary Claude (Anthropic), optional Gemini secondary.

Select with GENERATION_PROVIDER ("anthropic" default, "gemini" for
benchmarking). Call sites depend only on ``GenerationClient``.
"""
from __future__ import annotations

from app.providers.generation.anthropic import AnthropicGenerationClient, check_anthropic
from app.providers.generation.base import (
    GenerationClient,
    StructuredResult,
    parse_json_object,
    strict_object,
)
from app.providers.generation.gemini import GeminiGenerationClient, check_gemini_generation
from app.providers.shared.errors import ProviderConfigError
from app.providers.shared.types import HealthCheckResult


def get_generation_client(settings=None, provider: str | None = None, **overrides) -> GenerationClient:
    """Build the configured generator. ``provider`` overrides the setting."""
    if settings is None:
        from app.config import get_settings
        settings = get_settings()
    name = (provider or settings.generation_provider).strip().lower()
    common = {
        "timeout_seconds": settings.provider_timeout_seconds,
        "max_retries": settings.provider_max_retries,
        **overrides,
    }
    if name == "anthropic":
        return AnthropicGenerationClient(
            api_key=settings.anthropic_api_key,
            model=settings.generation_model,
            effort=settings.generation_effort,
            max_tokens=settings.generation_max_tokens,
            **common,
        )
    if name == "gemini":
        return GeminiGenerationClient(
            api_key=settings.gemini_api_key,
            model=settings.gemini_generation_model,
            **common,
        )
    raise ProviderConfigError(
        "generation", f"GENERATION_PROVIDER={name!r} is not supported; use 'anthropic' or 'gemini'.",
    )


async def check_generation_provider(settings=None, provider: str | None = None, **overrides) -> HealthCheckResult:
    """One cheap real structured-output call against the configured generator."""
    client = get_generation_client(settings, provider, **overrides)
    if isinstance(client, AnthropicGenerationClient):
        return await check_anthropic(client)
    return await check_gemini_generation(client)  # type: ignore[arg-type]


__all__ = [
    "AnthropicGenerationClient",
    "GeminiGenerationClient",
    "GenerationClient",
    "StructuredResult",
    "check_generation_provider",
    "get_generation_client",
    "parse_json_object",
    "strict_object",
]
