"""Provider error hierarchy.

Every failure a provider call can produce is mapped to one of these, with a
message a developer can act on. Callers catch ``ProviderError`` and never
need to inspect raw HTTP responses.
"""
from __future__ import annotations


class ProviderError(Exception):
    """Base class for all AI-provider failures."""

    def __init__(self, provider: str, message: str):
        self.provider = provider
        super().__init__(f"[{provider}] {message}")


class ProviderConfigError(ProviderError):
    """Required configuration (usually an API key) is missing or invalid.

    Raised before any network call is made.
    """


class ProviderAuthError(ProviderError):
    """The provider rejected the credentials (HTTP 401/403)."""


class ProviderQuotaError(ProviderError):
    """Insufficient credits / billing not enabled (HTTP 402)."""


class ProviderRateLimitError(ProviderError):
    """Still rate-limited (HTTP 429) after all retries."""


class ProviderTimeoutError(ProviderError):
    """The request timed out after all retries."""


class ProviderUnavailableError(ProviderError):
    """Network failure or 5xx from the provider after all retries."""


class ProviderRequestError(ProviderError):
    """The provider rejected the request as malformed (HTTP 400/404/413/422).

    Not retried: resending the same payload would fail the same way.
    """


class ProviderResponseError(ProviderError):
    """The provider answered, but the response is unusable.

    Examples: truncated by max_tokens, missing fields, JSON that does not
    parse, wrong embedding dimensionality.
    """


class ProviderRefusalError(ProviderResponseError):
    """The model declined to produce output (e.g. stop_reason="refusal")."""


def missing_key_error(provider: str, env_var: str, where_to_get: str) -> ProviderConfigError:
    """Build the standard, actionable 'missing API key' error."""
    return ProviderConfigError(
        provider,
        f"{env_var} is not set. Add it to second_brain-main/fastapi/.env "
        f"(copy .env.example). Get a key at {where_to_get}. "
        f"See AI_PROVIDER_DECISIONS.md, section 'Obtaining keys'.",
    )
