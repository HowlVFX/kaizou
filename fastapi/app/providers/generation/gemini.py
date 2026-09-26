"""Google Gemini — OPTIONAL secondary generator, for benchmarking only.

Enabled with GENERATION_PROVIDER=gemini. It lets the evaluation harness
compare two generator families on the same inputs (§14). It is not the
default and no call site depends on it.

Uses the Interactions API (the post-June-2026 "steps" schema):
    POST https://generativelanguage.googleapis.com/v1beta/interactions
    {"model": ..., "input": "...",
     "response_format": {"type": "text", "mime_type": "application/json",
                         "schema": {...}}}
    → {"steps": [{"type": "model_output",
                  "content": [{"type": "text", "text": "{...}"}]}], ...}

The system prompt is prepended to ``input`` rather than sent in a separate
field, because a system-instruction field for this API revision could not be
confirmed from Google's docs on 2026-09-26.
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from app.providers.generation.base import StructuredResult, parse_json_object
from app.providers.shared.errors import ProviderResponseError, missing_key_error
from app.providers.shared.http import post_json
from app.providers.shared.types import HealthCheckResult, Usage

INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
ENV_VAR = "GEMINI_API_KEY"
GET_KEY = "https://aistudio.google.com/apikey (Google AI Studio)"


class GeminiGenerationClient:
    provider_label = "gemini"

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gemini-3.8-flash",
        timeout_seconds: float = 120.0,
        max_retries: int = 3,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        if not api_key:
            raise missing_key_error(self.provider_label, ENV_VAR, GET_KEY)
        self._api_key = api_key
        self.model = model
        self._timeout = timeout_seconds
        self._max_retries = max_retries
        self._transport = transport

    async def generate_structured(
        self,
        *,
        system: str,
        prompt: str,
        schema: dict[str, Any],
        max_tokens: int | None = None,  # accepted for interface parity; unused
    ) -> StructuredResult:
        payload = {
            "model": self.model,
            "input": f"{system}\n\n{prompt}" if system else prompt,
            "response_format": {"type": "text", "mime_type": "application/json", "schema": schema},
        }
        body = await post_json(
            provider=self.provider_label,
            url=INTERACTIONS_URL,
            headers={"x-goog-api-key": self._api_key},
            payload=payload,
            key_hint=ENV_VAR,
            timeout_seconds=self._timeout,
            max_retries=self._max_retries,
            transport=self._transport,
        )

        texts: list[str] = []
        for step in body.get("steps", []):
            if step.get("type") != "model_output":
                continue
            texts.extend(c.get("text", "") for c in step.get("content", []) if c.get("type") == "text")
        if not texts:
            raise ProviderResponseError(
                self.provider_label, f"no model_output text (status={body.get('status')!r})",
            )

        usage_raw = body.get("usage") or {}
        return StructuredResult(
            data=parse_json_object(self.provider_label, "".join(texts)),
            model=str(body.get("model", self.model)),
            provider=self.provider_label,
            stop_reason=body.get("status"),
            usage=Usage(
                input_tokens=usage_raw.get("prompt_tokens") or usage_raw.get("input_tokens"),
                output_tokens=usage_raw.get("completion_tokens") or usage_raw.get("output_tokens"),
            ),
        )


async def check_gemini_generation(client: GeminiGenerationClient) -> HealthCheckResult:
    started = time.perf_counter()
    result = await client.generate_structured(
        system="Answer with the requested JSON object only.",
        prompt="What is the capital of France?",
        schema={"type": "object", "properties": {"capital": {"type": "string"}}, "required": ["capital"]},
    )
    return HealthCheckResult(
        role="generation",
        provider=client.provider_label,
        model=result.model,
        ok=True,
        latency_ms=(time.perf_counter() - started) * 1000,
        detail=f"structured output ok: {result.data}",
    )
