"""Anthropic Claude — the primary generative model.

Uses the Messages API with structured outputs (``output_config.format`` of
type ``json_schema``), which constrains decoding to the schema.

Verified against Anthropic docs on 2026-09-26 for ``claude-opus-5-5``:
- Adaptive thinking is always on; ``thinking`` must be omitted (disabled or
  budgeted thinking returns 400). Depth is set with ``output_config.effort``.
- ``temperature``/``top_p``/``top_k`` must be omitted (non-defaults → 400).
- Responses may begin with thinking blocks: read the *text* block by type.
- ``max_tokens`` covers thinking + output.
- Assistant prefill is rejected; structured outputs replace it.
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from app.providers.generation.base import StructuredResult, parse_json_object, strict_object
from app.providers.shared.errors import (
    ProviderRefusalError,
    ProviderResponseError,
    missing_key_error,
)
from app.providers.shared.http import post_json
from app.providers.shared.types import HealthCheckResult, Usage, usage_int

MESSAGES_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
ENV_VAR = "ANTHROPIC_API_KEY"
GET_KEY = "https://platform.claude.com/settings/keys (Claude Console)"


class AnthropicGenerationClient:
    provider_label = "anthropic"

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "claude-opus-5-5",
        effort: str | None = "medium",
        max_tokens: int = 16000,
        timeout_seconds: float = 120.0,
        max_retries: int = 3,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        if not api_key:
            raise missing_key_error(self.provider_label, ENV_VAR, GET_KEY)
        self._api_key = api_key
        self.model = model
        self._effort = effort or None
        self._max_tokens = max_tokens
        self._timeout = timeout_seconds
        self._max_retries = max_retries
        self._transport = transport

    async def generate_structured(
        self,
        *,
        system: str,
        prompt: str,
        schema: dict[str, Any],
        max_tokens: int | None = None,
        effort: str | None = None,
        variant: str = "",  # cache-only concept; ignored by the provider
    ) -> StructuredResult:
        output_config: dict[str, Any] = {"format": {"type": "json_schema", "schema": schema}}
        chosen_effort = effort or self._effort
        if chosen_effort:
            output_config["effort"] = chosen_effort

        payload: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens or self._max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
            "output_config": output_config,
        }
        body = await post_json(
            provider=self.provider_label,
            url=MESSAGES_URL,
            headers={"x-api-key": self._api_key, "anthropic-version": API_VERSION},
            payload=payload,
            key_hint=ENV_VAR,
            timeout_seconds=self._timeout,
            max_retries=self._max_retries,
            transport=self._transport,
        )

        # Usage first: every error below is raised after the call was billed.
        usage_raw = body.get("usage") or {}
        usage = Usage(
            input_tokens=usage_int(usage_raw, "input_tokens"),
            output_tokens=usage_int(usage_raw, "output_tokens"),
        )

        stop_reason = body.get("stop_reason")
        if stop_reason == "refusal":
            raise ProviderRefusalError(
                self.provider_label, "model declined the request (stop_reason=refusal)", usage=usage,
            )
        if stop_reason == "max_tokens":
            raise ProviderResponseError(
                self.provider_label,
                "output truncated (stop_reason=max_tokens); the JSON is incomplete. "
                "Raise GENERATION_MAX_TOKENS or lower GENERATION_EFFORT.",
                usage=usage,
            )
        if stop_reason == "model_context_window_exceeded":
            raise ProviderResponseError(
                self.provider_label, "input exceeds the model context window", usage=usage,
            )

        # Thinking blocks come first; select the text block by type, never by index.
        texts = [b.get("text", "") for b in body.get("content", []) if b.get("type") == "text"]
        if not texts:
            raise ProviderResponseError(
                self.provider_label, f"no text block in response (stop_reason={stop_reason})", usage=usage,
            )
        try:
            data = parse_json_object(self.provider_label, "".join(texts))
        except ProviderResponseError as exc:
            exc.usage = usage
            raise

        return StructuredResult(
            data=data,
            model=str(body.get("model", self.model)),
            provider=self.provider_label,
            stop_reason=stop_reason,
            usage=usage,
        )


HEALTH_SCHEMA = strict_object({"capital": {"type": "string"}})


async def check_anthropic(client: AnthropicGenerationClient) -> HealthCheckResult:
    """Tiny real structured call at low effort (fractions of a cent)."""
    started = time.perf_counter()
    result = await client.generate_structured(
        system="Answer with the requested JSON object only.",
        prompt="What is the capital of France?",
        schema=HEALTH_SCHEMA,
        max_tokens=2048,
        effort="low",
    )
    return HealthCheckResult(
        role="generation",
        provider=client.provider_label,
        model=result.model,
        ok=True,
        latency_ms=(time.perf_counter() - started) * 1000,
        detail=f"structured output ok: {result.data}",
        extra={"input_tokens": result.usage.input_tokens, "output_tokens": result.usage.output_tokens},
    )
