"""Types shared by every provider client."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass
class Usage:
    """Token/cost accounting reported by a provider (fields optional).

    ``output_tokens`` is the *billed* output: for thinking models it already
    includes thought tokens (Gemini bills thinking at the output rate).
    ``thought_tokens`` is kept separately for reporting only.
    ``estimated`` is True when the counts were derived from text length
    because the provider did not report usage.
    """
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    thought_tokens: int | None = None
    estimated: bool = False

    @property
    def reported(self) -> bool:
        """True when the provider gave at least one token/cost figure."""
        return (self.input_tokens is not None or self.output_tokens is not None
                or self.cost_usd is not None)


def usage_int(raw: Mapping[str, Any] | None, *keys: str) -> int | None:
    """First of ``keys`` present in ``raw`` as a non-negative int, else None.

    Tolerates int64 fields serialized as strings ("123") and treats 0 as a
    real value (``a or b`` would wrongly skip it).
    """
    if not isinstance(raw, Mapping):
        return None
    for key in keys:
        value = raw.get(key)
        if value is None or isinstance(value, bool):
            continue
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if number >= 0:
            return number
    return None


def usage_float(raw: Mapping[str, Any] | None, *keys: str) -> float | None:
    """Like ``usage_int`` for float fields such as a reported cost."""
    if not isinstance(raw, Mapping):
        return None
    for key in keys:
        value = raw.get(key)
        if value is None or isinstance(value, bool):
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if number >= 0:
            return number
    return None


@dataclass
class HealthCheckResult:
    """Outcome of a provider connectivity check."""
    role: str                # "classification" | "generation" | "embeddings"
    provider: str            # e.g. "jev/openrouter", "anthropic", "gemini"
    model: str
    ok: bool
    latency_ms: float | None = None
    detail: str = ""
    extra: dict[str, Any] = field(default_factory=dict)
