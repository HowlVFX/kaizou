"""Provider pricing table and cost estimation.

All prices are the developer/standard paid-tier rates in USD per 1,000,000
tokens, converted to INR with ``settings.usd_inr_rate``.

⚠ Prices verified 2026-09-26 from official pages. They change; re-check the
sources before trusting the numbers. The ledger records our *estimate*, which
is not the amount the provider actually bills.

Sources:
- Gemini (ai.google.dev/gemini-api/docs/pricing): gemini-3.8-flash
  $0.75 in / $3.75 out per 1M through 2026-12-31 (doubles 2027-01-01).
  gemini-embedding-2 text $0.20 per 1M in.
- Jev / TypeSafe: input-billed, output free; community-reported
  $0.042 per 1M input. Each response also returns usage.cost (authoritative).
"""
from __future__ import annotations

from dataclasses import dataclass

PRICING_VERIFIED = "2026-09-26"
PRICING_SOURCE = "official Gemini pricing page; TypeSafe/OpenRouter community docs for Jev"


@dataclass(frozen=True)
class ModelPrice:
    input_per_mtok_usd: float
    output_per_mtok_usd: float


# Keyed by the model ID the client actually sends.
MODEL_PRICES: dict[str, ModelPrice] = {
    # Generation
    "gemini-3.8-flash": ModelPrice(0.75, 3.75),
    "gemini-3.7-flash": ModelPrice(0.75, 3.75),
    "gemini-3.5-flash-lite": ModelPrice(0.30, 2.50),
    # Embeddings (output tokens are not billed separately)
    "gemini-embedding-2": ModelPrice(0.20, 0.0),
    # Jev — input billed, output free. usage.cost is authoritative when present.
    "typesafe/jev-1.13": ModelPrice(0.042, 0.0),
    "jev-latest": ModelPrice(0.042, 0.0),
    "jev-1.13.0": ModelPrice(0.042, 0.0),
}

# Fallback when a model ID is unknown: assume the most expensive generator we
# use, so estimates never under-count against the budget.
_FALLBACK = ModelPrice(0.75, 3.75)


def _price_for(model: str) -> ModelPrice:
    return MODEL_PRICES.get(model, _FALLBACK)


def estimate_cost_inr(model: str, input_tokens: int, output_tokens: int, usd_inr: float) -> float:
    """Estimated INR cost for a call with the given token counts."""
    p = _price_for(model)
    usd = (input_tokens / 1_000_000) * p.input_per_mtok_usd \
        + (output_tokens / 1_000_000) * p.output_per_mtok_usd
    return usd * usd_inr


def worst_case_cost_inr(model: str, max_input_tokens: int, max_output_tokens: int, usd_inr: float) -> float:
    """Upper-bound INR cost, used to *reserve* budget before a call runs.

    Reserving the worst case means a runaway loop is stopped by the cap even
    before any single response's real usage is known.
    """
    return estimate_cost_inr(model, max_input_tokens, max_output_tokens, usd_inr)
