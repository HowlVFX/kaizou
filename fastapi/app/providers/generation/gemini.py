"""Google Gemini generation via the Interactions API.

Wire format (the post-June-2026 "steps" schema; field names re-verified
against https://ai.google.dev/api/interactions-api on 2026-09-26):
    POST https://generativelanguage.googleapis.com/v1beta/interactions
    {"model": ..., "input": "...", "system_instruction": "...",
     "response_format": {"type": "text", "mime_type": "application/json",
                         "schema": {...}},
     "generation_config": {"max_output_tokens": N, "thinking_level": "low"},
     "store": false}
    → {"status": "completed" | "incomplete" | ...,
       "steps": [{"type": "model_output",
                  "content": [{"type": "text", "text": "{...}"}]}],
       "usage": {"total_input_tokens": ..., "total_output_tokens": ...,
                 "total_thought_tokens": ..., "total_cached_tokens": ...,
                 "total_tool_use_tokens": ..., "total_tokens": ...}}

Accounting notes:
- ``max_output_tokens`` is a hard ceiling on thinking + visible output
  combined for Gemini 3.x models, so it also bounds thinking spend. There is
  no numeric thinking budget on this API; ``thinking_level``
  (minimal/low/medium/high) is the only thinking control.
- ``total_output_tokens`` excludes thoughts (the documented example sums
  input + output + thought = total). Thought tokens are billed at the output
  rate, so billed output = output + thought.
- status "incomplete" means the response hit max_output_tokens: the JSON is
  truncated but the tokens were billed, so the error carries the usage.
- ``store: false`` so note/answer text is not retained server-side for the
  (unused) stateful-conversation feature.

No google-genai SDK is installed; this client speaks REST directly.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.providers.generation.base import StructuredResult, parse_json_object
from app.providers.shared.errors import ProviderConfigError, ProviderResponseError, missing_key_error
from app.providers.shared.http import post_json
from app.providers.shared.types import HealthCheckResult, Usage, usage_int

logger = logging.getLogger(__name__)

INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
ENV_VAR = "GEMINI_API_KEY"
GET_KEY = "https://aistudio.google.com/apikey (Google AI Studio)"
THINKING_LEVELS = {"minimal", "low", "medium", "high"}


def parse_gemini_usage(body: dict[str, Any]) -> Usage:
    """Token usage from an Interactions response (billed output includes thoughts).

    Primary keys are the Interactions API ``usage`` fields. The
    generateContent-style ``usageMetadata`` (camelCase) / ``usage_metadata``
    (SDK snake_case) shapes are accepted as fallbacks so a wire-format change
    degrades to correct numbers rather than to a worst-case charge.
    """
    raw = body.get("usage")
    if isinstance(raw, dict) and raw:
        in_tok = usage_int(raw, "total_input_tokens", "input_tokens", "prompt_tokens")
        out_tok = usage_int(raw, "total_output_tokens", "output_tokens", "completion_tokens")
        thought = usage_int(raw, "total_thought_tokens", "thought_tokens")
        total = usage_int(raw, "total_tokens")
    else:
        raw = body.get("usageMetadata") or body.get("usage_metadata") or {}
        in_tok = usage_int(raw, "promptTokenCount", "prompt_token_count")
        out_tok = usage_int(raw, "candidatesTokenCount", "candidates_token_count")
        thought = usage_int(raw, "thoughtsTokenCount", "thoughts_token_count")
        total = usage_int(raw, "totalTokenCount", "total_token_count")

    if out_tok is None and total is not None and in_tok is not None:
        # total = input + output + thought (+ tool use); the remainder is
        # all output-rate tokens, thoughts included.
        billed_out: int | None = max(0, total - in_tok)
    elif out_tok is not None:
        billed_out = out_tok + (thought or 0)
    else:
        billed_out = None
    return Usage(input_tokens=in_tok, output_tokens=billed_out, thought_tokens=thought)


class GeminiGenerationClient:
    provider_label = "gemini"

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gemini-3.8-flash",
        max_tokens: int = 16000,
        thinking_level: str = "",
        timeout_seconds: float = 120.0,
        max_retries: int = 3,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        if not api_key:
            raise missing_key_error(self.provider_label, ENV_VAR, GET_KEY)
        level = (thinking_level or "").strip().lower()
        if level and level not in THINKING_LEVELS:
            raise ProviderConfigError(
                self.provider_label,
                f"GEMINI_THINKING_LEVEL={thinking_level!r} is not supported; "
                f"use one of {sorted(THINKING_LEVELS)} or leave blank for the model default.",
            )
        self._api_key = api_key
        self.model = model
        self._max_tokens = max_tokens
        self._thinking_level = level
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
        variant: str = "",  # cache-only concept; ignored by the provider
    ) -> StructuredResult:
        generation_config: dict[str, Any] = {"max_output_tokens": int(max_tokens or self._max_tokens)}
        if self._thinking_level:
            generation_config["thinking_level"] = self._thinking_level
        payload: dict[str, Any] = {
            "model": self.model,
            "input": prompt,
            "response_format": {"type": "text", "mime_type": "application/json", "schema": schema},
            "generation_config": generation_config,
            "store": False,
        }
        if system:
            payload["system_instruction"] = system
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
        if not isinstance(body, dict):
            raise ProviderResponseError(self.provider_label, f"expected a JSON object, got {type(body).__name__}")

        # Parse usage first: every error below happens after billing.
        usage = parse_gemini_usage(body)
        status = body.get("status")

        texts: list[str] = []
        for step in body.get("steps") or []:
            if not isinstance(step, dict) or step.get("type") != "model_output":
                continue
            texts.extend(
                c.get("text", "") for c in step.get("content") or []
                if isinstance(c, dict) and c.get("type") == "text"
            )
        text = "".join(texts)

        if not usage.reported:
            # Genuinely missing: estimate (~4 chars/token) rather than let the
            # guard charge the worst case. Thought tokens are unknowable here.
            logger.warning("gemini response has no usage; estimating tokens from text length")
            usage = Usage(
                input_tokens=max(1, (len(system) + len(prompt)) // 4),
                output_tokens=max(1, len(text) // 4),
                estimated=True,
            )

        if status == "incomplete":
            raise ProviderResponseError(
                self.provider_label,
                "output truncated (status=incomplete, hit max_output_tokens); the JSON is "
                "incomplete. Raise GENERATION_MAX_TOKENS or lower GEMINI_THINKING_LEVEL.",
                usage=usage,
            )
        if not texts:
            raise ProviderResponseError(
                self.provider_label, f"no model_output text (status={status!r})", usage=usage,
            )
        try:
            data = parse_json_object(self.provider_label, text)
        except ProviderResponseError as exc:
            exc.usage = usage
            raise

        return StructuredResult(
            data=data,
            model=str(body.get("model", self.model)),
            provider=self.provider_label,
            stop_reason=status,
            usage=usage,
        )


async def check_gemini_generation(client: GeminiGenerationClient) -> HealthCheckResult:
    started = time.perf_counter()
    result = await client.generate_structured(
        system="Answer with the requested JSON object only.",
        prompt="What is the capital of France?",
        schema={"type": "object", "properties": {"capital": {"type": "string"}}, "required": ["capital"]},
        max_tokens=2048,
    )
    return HealthCheckResult(
        role="generation",
        provider=client.provider_label,
        model=result.model,
        ok=True,
        latency_ms=(time.perf_counter() - started) * 1000,
        detail=f"structured output ok: {result.data}",
        extra={"input_tokens": result.usage.input_tokens, "output_tokens": result.usage.output_tokens,
               "thought_tokens": result.usage.thought_tokens},
    )
