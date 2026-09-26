"""Types shared by every provider client."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Usage:
    """Token/cost accounting reported by a provider (fields optional)."""
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None


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
