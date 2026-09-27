"""Budget + cache guards around the raw provider clients.

Call sites use these guarded wrappers instead of the raw clients so that
every paid call is: cache-checked → budget-reserved → executed → recorded →
cached. A cache hit costs nothing and never touches the budget.

The raw clients (used by the health check) are untouched and keep working
without a ledger or cache. Guards are opt-in via the factory ``guarded=True``
paths in each provider package.

Token estimation for the worst-case reservation is deliberately rough and
biased high (see ``_estimate_tokens``): over-reserving is safe because
``record`` corrects the ledger down to the real cost afterward.

Settlement (``settle_call``): every reservation is settled exactly once, in a
``finally``, whatever happens to the call:

- success                         → record the reported usage (or a text-length
                                    estimate, with a warning, if none was reported)
- ProviderResponseError w/ usage  → the provider answered and billed, only our
                                    parsing failed → record that usage
- ProviderResponseError w/o usage → answered (likely billed), usage unknown
                                    → keep the worst case
- ProviderTimeoutError            → the request may have been processed and
                                    billed → keep the worst case
- other ProviderError             → the provider rejected the request (4xx,
                                    auth, quota, rate limit) or failed (5xx,
                                    network); these are not billed → release
- asyncio.CancelledError, or any  → the request may have been in flight, so
  unexpected exception              it may have been billed → keep the worst
                                    case (the conservative choice; we cannot
                                    tell whether the provider saw it).

A cancellation *inside* ``reserve`` rolls its transaction back; if it lands
while the COMMIT itself is in flight, the hold may persist at worst case as
``reserved = true`` (over-counts, never under-counts).

Settlement runs under ``asyncio.shield`` so a second cancellation cannot
abandon it half-way, and its own failures are logged, never raised over the
original error: if settling fails, the row keeps its worst-case hold, which
is again the safe direction.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
from typing import Any, Awaitable, Callable, Sequence, TypeVar

from app.providers.budget import BudgetLedger, Reservation
from app.providers.cache import AICache, embedding_key, generation_key
from app.providers.embeddings.gemini import MAX_BATCH, EmbeddingTask, GeminiEmbeddingClient, format_input
from app.providers.generation.base import GenerationClient, StructuredResult
from app.providers.pricing import estimate_cost_inr, worst_case_cost_inr
from app.providers.shared.errors import ProviderError, ProviderResponseError, ProviderTimeoutError
from app.providers.shared.types import Usage

logger = logging.getLogger(__name__)

# ~4 chars per token is the usual rough rule for English.
CHARS_PER_TOKEN = 4

T = TypeVar("T")


def _estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / CHARS_PER_TOKEN))


async def settle_call(
    ledger: BudgetLedger,
    reservation: Reservation,
    call: Callable[[], Awaitable[T]],
    *,
    model: str,
    usd_inr: float,
    worst_in: int,
    worst_out: int,
    usage_of: Callable[[T], Usage],
    estimate_out: Callable[[T], int] = lambda _result: 0,
) -> T:
    """Run ``call`` and settle ``reservation`` exactly once (see module doc).

    ``usage_of`` extracts the Usage from a successful result;
    ``estimate_out`` estimates output tokens from it when usage is missing.
    """
    # Default outcome: conservative worst case, used for cancellation and
    # unexpected errors. Replaced below as facts are learned.
    outcome: tuple[str, Any] = ("worst", "cancelled or unexpected error during the call")
    try:
        result = await call()
        usage = usage_of(result)
        if usage.input_tokens is None or usage.output_tokens is None:
            if usage.cost_usd is None:
                logger.warning("%s returned no token usage; estimating from text length", reservation.provider)
            usage = Usage(
                input_tokens=usage.input_tokens if usage.input_tokens is not None else worst_in,
                output_tokens=usage.output_tokens if usage.output_tokens is not None else estimate_out(result),
                cost_usd=usage.cost_usd,
                thought_tokens=usage.thought_tokens,
                estimated=True,
            )
        outcome = ("usage", (usage, True))
        return result
    except ProviderResponseError as exc:
        if exc.usage is not None and exc.usage.reported:
            u = exc.usage
            outcome = ("usage", (Usage(
                input_tokens=u.input_tokens if u.input_tokens is not None else worst_in,
                output_tokens=u.output_tokens if u.output_tokens is not None else worst_out,
                cost_usd=u.cost_usd, thought_tokens=u.thought_tokens,
                estimated=u.estimated or u.input_tokens is None or u.output_tokens is None,
            ), False))
        else:
            outcome = ("worst", f"unusable response without usage: {type(exc).__name__}")
        raise
    except ProviderTimeoutError:
        outcome = ("worst", "timeout: request may have been processed")
        raise
    except ProviderError:
        outcome = ("release", None)
        raise
    finally:
        try:
            await asyncio.shield(_settle(ledger, reservation, outcome, model=model, usd_inr=usd_inr))
        except asyncio.CancelledError:
            # A second cancel interrupted our wait; the shielded settle
            # keeps running. Let the original exception (if any) propagate.
            pass
        except Exception:
            logger.exception("budget: failed to settle reservation %s; worst-case hold remains", reservation.id)


async def _settle(ledger: BudgetLedger, reservation: Reservation, outcome, *, model: str, usd_inr: float) -> None:
    kind, detail = outcome
    if kind == "release":
        await ledger.release(reservation)
    elif kind == "worst":
        await ledger.keep_worst_case(reservation, reason=detail)
    else:
        usage, success = detail
        if usage.cost_usd is not None:
            cost = usage.cost_usd * usd_inr  # provider-reported cost is authoritative
        else:
            cost = estimate_cost_inr(model, usage.input_tokens or 0, usage.output_tokens or 0, usd_inr)
        await ledger.record(
            reservation, input_tokens=usage.input_tokens, output_tokens=usage.output_tokens,
            cost_inr=cost, tokens_estimated=usage.estimated, success=success,
        )


class GuardedGenerationClient:
    """Wraps a GenerationClient with reuse cache + budget enforcement."""

    def __init__(self, inner: GenerationClient, *, ledger: BudgetLedger, cache: AICache, settings):
        self._inner = inner
        self._ledger = ledger
        self._cache = cache
        self._s = settings
        self.provider_label = inner.provider_label
        self.model = inner.model

    async def generate_structured(
        self,
        *,
        system: str,
        prompt: str,
        schema: dict[str, Any],
        max_tokens: int | None = None,
        task: str = "generation",
        content_version: str = "",
        variant: str = "",
    ) -> StructuredResult:
        cap_out = max_tokens or self._s.generation_max_tokens
        params = {"max_tokens": cap_out, "effort": self._s.generation_effort}
        key = generation_key(
            task=task, model=self.model, prompt_version=self._s.ai_prompt_version,
            content_version=content_version, params=params, schema=schema,
            system=system, prompt=prompt, variant=variant,
        )

        cached = await self._cache.get("generation", key)
        if cached is not None:
            return StructuredResult(
                data=cached, model=self.model, provider=self.provider_label,
                stop_reason="cache", usage=Usage(),
            )

        # The schema is sent too, so it counts toward input.
        worst_in = _estimate_tokens(system) + _estimate_tokens(prompt) \
            + _estimate_tokens(json.dumps(schema))
        worst = worst_case_cost_inr(self.model, worst_in, cap_out, self._s.usd_inr_rate)
        reservation = await self._ledger.reserve(self.provider_label, self.model, task, worst)

        result = await settle_call(
            self._ledger, reservation,
            # Pass the same cap we reserved for, so output is actually bounded by it.
            lambda: self._inner.generate_structured(
                system=system, prompt=prompt, schema=schema, max_tokens=cap_out,
            ),
            model=self.model, usd_inr=self._s.usd_inr_rate,
            worst_in=worst_in, worst_out=cap_out,
            usage_of=lambda r: r.usage,
            estimate_out=lambda r: _estimate_tokens(json.dumps(r.data, ensure_ascii=False)),
        )
        await self._cache.put("generation", key, self.model, result.data)
        return result


class GuardedEmbeddingClient:
    """Wraps GeminiEmbeddingClient with per-text cache + budget enforcement."""

    provider_label = "gemini"

    def __init__(self, inner: GeminiEmbeddingClient, *, ledger: BudgetLedger, cache: AICache, settings):
        self._inner = inner
        self._ledger = ledger
        self._cache = cache
        self._s = settings
        self.model = inner.model
        self.dimensions = inner.dimensions

    async def embed(
        self, texts: Sequence[str], task: EmbeddingTask = EmbeddingTask.SEMANTIC_SIMILARITY,
    ) -> list[list[float]]:
        if not texts:
            return []
        results: list[list[float] | None] = [None] * len(texts)
        to_compute: list[int] = []

        # 1. Serve what we can from cache.
        for i, text in enumerate(texts):
            key = embedding_key(text=text, model=self.model, dimensions=self.dimensions)
            hit = await self._cache.get("embedding", key)
            if hit is not None:
                results[i] = hit
            else:
                to_compute.append(i)

        # 2. Reserve + compute the misses, one reservation per provider call,
        #    so a failure in a later chunk never erases spend of an earlier one.
        for start in range(0, len(to_compute), MAX_BATCH):
            chunk_idx = to_compute[start:start + MAX_BATCH]
            miss_texts = [texts[i] for i in chunk_idx]
            worst_in = sum(_estimate_tokens(format_input(t, task)) for t in miss_texts)
            worst = worst_case_cost_inr(self.model, worst_in, 0, self._s.usd_inr_rate)
            reservation = await self._ledger.reserve(self.provider_label, self.model, "embedding", worst)
            vectors, _usage = await settle_call(
                self._ledger, reservation,
                lambda: self._inner.embed_chunk_with_usage(miss_texts, task),
                model=self.model, usd_inr=self._s.usd_inr_rate,
                worst_in=worst_in, worst_out=0,
                usage_of=lambda r: r[1],
            )
            for idx, vec in zip(chunk_idx, vectors):
                results[idx] = vec
                key = embedding_key(text=texts[idx], model=self.model, dimensions=self.dimensions)
                await self._cache.put("embedding", key, self.model, vec)

        return [r for r in results if r is not None]

    async def embed_one(self, text: str, task: EmbeddingTask = EmbeddingTask.SEMANTIC_SIMILARITY) -> list[float]:
        return (await self.embed([text], task))[0]
