"""Common interface for generative (structured-output) providers.

🔒 The generator emits structured objects only — never a score, grade, or
verdict (§1.2). Every call site passes a JSON Schema and gets a dict back.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.providers.shared.errors import ProviderResponseError
from app.providers.shared.types import Usage


@dataclass
class StructuredResult:
    """A schema-conforming object returned by a generator."""
    data: dict[str, Any]
    model: str
    provider: str
    stop_reason: str | None = None
    usage: Usage = field(default_factory=Usage)


class GenerationClient(Protocol):
    """What every generation provider implements."""

    provider_label: str
    model: str

    async def generate_structured(
        self,
        *,
        system: str,
        prompt: str,
        schema: dict[str, Any],
        max_tokens: int | None = None,
    ) -> StructuredResult:
        """Return an object conforming to ``schema`` (a JSON Schema dict)."""
        ...


def strict_object(properties: dict[str, Any]) -> dict[str, Any]:
    """JSON Schema object with every property required and no extras.

    Structured-output grammars are cheapest and most reliable when nothing is
    optional (Anthropic caps optional params at 24 per request). Represent
    "absent" as an explicit ``null`` type instead of omitting a field.
    """
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


def parse_json_object(provider: str, text: str) -> dict[str, Any]:
    """Parse a model's JSON text into a dict, with an actionable error."""
    try:
        value = json.loads(text)
    except (TypeError, ValueError) as exc:
        raise ProviderResponseError(provider, f"output is not valid JSON: {text[:300]!r}") from exc
    if not isinstance(value, dict):
        raise ProviderResponseError(provider, f"expected a JSON object, got {type(value).__name__}")
    return value
