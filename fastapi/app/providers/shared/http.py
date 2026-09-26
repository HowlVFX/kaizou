"""Retrying JSON-over-HTTP helper used by every provider client.

Policy:
- Retries: network errors, timeouts, HTTP 408, 409, 429, 500, 502, 503, 504,
  and 529 (Anthropic "overloaded").
- Backoff: exponential with full jitter (0.5s base, 20s cap). A server
  ``Retry-After`` header (seconds) takes precedence when present.
- Never retried: 400/401/402/403/404/413/422. Resending would fail the same way.
- Every failure becomes a typed ``ProviderError``; raw httpx exceptions and
  stack traces never escape to callers.
"""
from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import httpx

from app.providers.shared.errors import (
    ProviderAuthError,
    ProviderError,
    ProviderQuotaError,
    ProviderRateLimitError,
    ProviderRequestError,
    ProviderResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504, 529}
BACKOFF_BASE_SECONDS = 0.5
BACKOFF_CAP_SECONDS = 20.0


def _backoff_delay(attempt: int, retry_after: str | None) -> float:
    if retry_after:
        try:
            return min(float(retry_after), BACKOFF_CAP_SECONDS * 3)
        except ValueError:
            pass  # HTTP-date form; fall back to computed backoff
    ceiling = min(BACKOFF_CAP_SECONDS, BACKOFF_BASE_SECONDS * (2 ** attempt))
    return random.uniform(0, ceiling)


def _error_snippet(response: httpx.Response, limit: int = 500) -> str:
    """Short body excerpt for error messages. Never includes request headers."""
    try:
        text = response.text
    except Exception:  # pragma: no cover - defensive
        return ""
    return text[:limit].strip()


def _raise_for_status(provider: str, response: httpx.Response, key_hint: str) -> None:
    status = response.status_code
    body = _error_snippet(response)
    if status in (401, 403):
        raise ProviderAuthError(
            provider,
            f"HTTP {status}: credentials rejected. Check {key_hint} is correct "
            f"and active. Provider said: {body}",
        )
    if status == 402:
        raise ProviderQuotaError(
            provider,
            f"HTTP 402: insufficient credits or billing not enabled on the "
            f"account behind {key_hint}. Provider said: {body}",
        )
    if status == 429:
        raise ProviderRateLimitError(provider, f"HTTP 429 after retries: {body}")
    if status >= 500:
        raise ProviderUnavailableError(provider, f"HTTP {status} after retries: {body}")
    if status == 404:
        raise ProviderRequestError(
            provider,
            f"HTTP 404: endpoint or model not found — check the configured "
            f"model ID. Provider said: {body}",
        )
    raise ProviderRequestError(provider, f"HTTP {status}: {body}")


async def post_json(
    *,
    provider: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    key_hint: str,
    timeout_seconds: float,
    max_retries: int,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """POST ``payload`` as JSON and return the decoded JSON body.

    Args:
        provider: label used in error messages, e.g. "anthropic".
        key_hint: env var name to mention on auth/billing errors.
        transport: optional httpx transport (tests inject a MockTransport).
    """
    attempts = max(0, max_retries) + 1
    timeout = httpx.Timeout(timeout_seconds, connect=min(15.0, timeout_seconds))

    async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
        for attempt in range(attempts):
            last_attempt = attempt == attempts - 1
            try:
                response = await client.post(url, headers=headers, json=payload)
            except httpx.TimeoutException as exc:
                if last_attempt:
                    raise ProviderTimeoutError(
                        provider,
                        f"timed out after {attempts} attempt(s) "
                        f"({timeout_seconds:.0f}s each). Raise "
                        f"PROVIDER_TIMEOUT_SECONDS if this is a large request.",
                    ) from exc
                delay = _backoff_delay(attempt, None)
            except httpx.TransportError as exc:
                if last_attempt:
                    raise ProviderUnavailableError(
                        provider, f"network error after {attempts} attempt(s): {exc!r}",
                    ) from exc
                delay = _backoff_delay(attempt, None)
            else:
                if response.status_code < 400:
                    try:
                        return response.json()
                    except ValueError as exc:
                        raise ProviderResponseError(
                            provider, f"non-JSON response: {_error_snippet(response)}",
                        ) from exc
                if response.status_code not in RETRYABLE_STATUS or last_attempt:
                    _raise_for_status(provider, response, key_hint)
                delay = _backoff_delay(attempt, response.headers.get("retry-after"))
                logger.warning(
                    "%s returned HTTP %s; retry %d/%d in %.1fs",
                    provider, response.status_code, attempt + 1, attempts - 1, delay,
                )
            await asyncio.sleep(delay)

    # Unreachable: the loop either returns or raises.
    raise ProviderError(provider, "request loop exited unexpectedly")  # pragma: no cover
