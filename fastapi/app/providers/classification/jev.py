"""Jev (TypeSafe AI System One decision model) client.

Jev takes a *state* plus named *questions* and returns typed answers with
probabilities — never free text. Three question primitives:

- Choice: pick one label from a set → choice, probabilities, confidence
- Noul:   is this statement true?   → noul (probability of yes, 0..1)
- Score:  position on ordered scale → score (prob-weighted index),
                                      probabilities, confidence

All questions in one request are evaluated in parallel and cannot see each
other's answers, so batch independent questions about the same state.

Wire format (verified 2026-09-26 against OpenRouter + TypeSafe docs):
    POST {endpoint}
    {"model": ..., "state": str|object|array,
     "questions": {"<id>": {"type": "choice|noul|score",
                            "instructions": "...", "criteria": ...}}}
    → {"model": ..., "answers": {"<id>": {...}}, "usage": {..., "cost": ...}}

Backends (same wire format, same response shape):
- openrouter: POST https://openrouter.ai/api/alpha/decisions
              auth OPENROUTER_API_KEY, model "typesafe/jev-1.13"
- typesafe:   POST https://api.typesafe.ai/v1/systemone
              auth TYPESAFE_API_KEY, model "jev-latest"

🔒 Jev classifies *note content*. It must never be pointed at a learner's
answer to decide a grade — that would be model judgment, which the design
forbids (§2.4 "No LLM-as-judge"). Grading stays deterministic.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence, Union

import httpx

from app.providers.shared.errors import (
    ProviderConfigError,
    ProviderResponseError,
    missing_key_error,
)
from app.providers.shared.http import post_json
from app.providers.shared.types import HealthCheckResult, Usage, usage_float, usage_int

BACKENDS: dict[str, dict[str, str]] = {
    "openrouter": {
        "url": "https://openrouter.ai/api/alpha/decisions",
        "env_var": "OPENROUTER_API_KEY",
        "get_key": "https://openrouter.ai/settings/keys",
        # Pinned so tuned thresholds stay stable; ~typesafe/jev-latest moves.
        "default_model": "typesafe/jev-1.13",
    },
    "typesafe": {
        "url": "https://api.typesafe.ai/v1/systemone",
        "env_var": "TYPESAFE_API_KEY",
        "get_key": "https://console.typesafe.ai/settings/keys",
        # TODO(verify): a pinned native model ID was not confirmable from
        # official docs on 2026-09-26; "jev-latest" is the documented alias.
        "default_model": "jev-latest",
    },
}


# ---------------------------------------------------------------------------
# Question builders
# ---------------------------------------------------------------------------

@dataclass
class Choice:
    """Pick exactly one label. ``criteria`` maps label → description."""
    instructions: str
    criteria: Mapping[str, Any]

    def to_wire(self) -> dict[str, Any]:
        return {"type": "choice", "instructions": self.instructions,
                "criteria": dict(self.criteria)}


@dataclass
class Noul:
    """Yes/no. Phrase so that a high value means *yes*."""
    instructions: str
    criteria: Mapping[str, Any] | None = None  # optional {"true": ..., "false": ...}

    def to_wire(self) -> dict[str, Any]:
        wire: dict[str, Any] = {"type": "noul", "instructions": self.instructions}
        if self.criteria:
            wire["criteria"] = dict(self.criteria)
        return wire


@dataclass
class Score:
    """Ordered scale. ``criteria[0]`` is the lowest level (≈10 levels max)."""
    instructions: str
    criteria: Sequence[Any]

    def to_wire(self) -> dict[str, Any]:
        return {"type": "score", "instructions": self.instructions,
                "criteria": list(self.criteria)}


Question = Union[Choice, Noul, Score]


# ---------------------------------------------------------------------------
# Typed answers
# ---------------------------------------------------------------------------

@dataclass
class ChoiceAnswer:
    choice: str
    probabilities: dict[str, float]
    confidence: float


@dataclass
class NoulAnswer:
    probability: float  # probability of "yes"


@dataclass
class ScoreAnswer:
    score: float                      # Σ index × p(index)
    probabilities: dict[int, float]
    confidence: float

    @property
    def level(self) -> int:
        """Most probable level index."""
        return max(self.probabilities, key=self.probabilities.get) if self.probabilities \
            else round(self.score)


Answer = Union[ChoiceAnswer, NoulAnswer, ScoreAnswer]


@dataclass
class Decision:
    """Full response to one Jev request."""
    answers: dict[str, Answer]
    model: str
    usage: Usage = field(default_factory=Usage)
    raw: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

class JevClient:
    """Thin async client for Jev decisions."""

    def __init__(
        self,
        *,
        api_key: str,
        backend: str = "openrouter",
        model: str = "",
        timeout_seconds: float = 30.0,
        max_retries: int = 3,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        if backend not in BACKENDS:
            raise ProviderConfigError(
                "jev", f"JEV_BACKEND={backend!r} is not supported; use one of "
                       f"{sorted(BACKENDS)}.",
            )
        spec = BACKENDS[backend]
        if not api_key:
            raise missing_key_error(f"jev/{backend}", spec["env_var"], spec["get_key"])
        self._api_key = api_key
        self._backend = backend
        self._spec = spec
        self.model = model or spec["default_model"]
        self._timeout = timeout_seconds
        self._max_retries = max_retries
        self._transport = transport

    @property
    def provider_label(self) -> str:
        return f"jev/{self._backend}"

    async def decide(
        self,
        state: Union[str, Mapping[str, Any], Sequence[Any]],
        questions: Mapping[str, Question],
    ) -> Decision:
        """Ask one or more typed questions about ``state``."""
        if not questions:
            raise ValueError("decide() needs at least one question")
        payload = {
            "model": self.model,
            "state": state,
            "questions": {qid: q.to_wire() for qid, q in questions.items()},
        }
        body = await post_json(
            provider=self.provider_label,
            url=self._spec["url"],
            headers={"Authorization": f"Bearer {self._api_key}"},
            payload=payload,
            key_hint=self._spec["env_var"],
            timeout_seconds=self._timeout,
            max_retries=self._max_retries,
            transport=self._transport,
        )
        return self._parse(body, questions)

    @staticmethod
    def parse_usage(body: Mapping[str, Any]) -> Usage:
        """Usage from a Jev response.

        Documented shape (TypeSafe System One reference as mirrored by the
        ZenMux and Cloudflare Workers AI docs, checked 2026-09-26):
        ``usage: {"input_tokens": int, "output_tokens": int}``; OpenRouter
        additionally returns ``usage.cost`` in USD (authoritative when present).
        ``prompt_tokens``/``completion_tokens`` are accepted as fallbacks.
        Output is not billed for Jev, so it is recorded as 0 for pricing.
        """
        raw = body.get("usage") if isinstance(body, Mapping) else None
        raw = raw if isinstance(raw, Mapping) else {}
        return Usage(
            input_tokens=usage_int(raw, "input_tokens", "prompt_tokens"),
            output_tokens=usage_int(raw, "output_tokens", "completion_tokens"),
            cost_usd=usage_float(raw, "cost", "total_cost"),
        )

    def _parse(self, body: dict[str, Any], questions: Mapping[str, Question]) -> Decision:
        # Usage first: a malformed answer is still a billed call.
        usage = self.parse_usage(body)
        raw_answers = body.get("answers") if isinstance(body, dict) else None
        if not isinstance(raw_answers, dict):
            raise ProviderResponseError(
                self.provider_label, f"no 'answers' object in response: {str(body)[:300]}", usage=usage,
            )

        answers: dict[str, Answer] = {}
        for qid, question in questions.items():
            a = raw_answers.get(qid)
            if not isinstance(a, dict):
                raise ProviderResponseError(
                    self.provider_label, f"missing answer for question {qid!r}", usage=usage,
                )
            try:
                if isinstance(question, Choice):
                    answers[qid] = ChoiceAnswer(
                        choice=str(a["choice"]),
                        probabilities={str(k): float(v) for k, v in (a.get("probabilities") or {}).items()},
                        confidence=float(a.get("confidence", 0.0)),
                    )
                elif isinstance(question, Noul):
                    # Documented field is "noul"; some SDK layers surface "probability".
                    value = a["noul"] if "noul" in a else a["probability"]
                    answers[qid] = NoulAnswer(probability=float(value))
                else:
                    answers[qid] = ScoreAnswer(
                        score=float(a["score"]),
                        probabilities={int(k): float(v) for k, v in (a.get("probabilities") or {}).items()},
                        confidence=float(a.get("confidence", 0.0)),
                    )
            except (KeyError, TypeError, ValueError) as exc:
                raise ProviderResponseError(
                    self.provider_label, f"malformed answer for {qid!r}: {a!r}", usage=usage,
                ) from exc

        return Decision(answers=answers, model=str(body.get("model", self.model)), usage=usage, raw=body)


# ---------------------------------------------------------------------------
# Factory + health check
# ---------------------------------------------------------------------------

def get_classification_client(settings=None, **overrides) -> JevClient:
    """Build the configured Jev client from Settings."""
    if settings is None:
        from app.config import get_settings
        settings = get_settings()
    backend = settings.jev_backend.strip().lower()
    key = settings.typesafe_api_key if backend == "typesafe" else settings.openrouter_api_key
    return JevClient(
        api_key=key,
        backend=backend,
        model=settings.jev_model,
        timeout_seconds=min(settings.provider_timeout_seconds, 60.0),
        max_retries=settings.provider_max_retries,
        **overrides,
    )


class GuardedJevClient:
    """Wraps JevClient with budget enforcement + classification cache.

    Jev is cheap (input-billed, output free) but a looping bug still spends,
    so classification goes through the same reserve/record/cache path.
    """

    def __init__(self, inner: "JevClient", *, ledger, cache, settings):
        self._inner = inner
        self._ledger = ledger
        self._cache = cache
        self._s = settings
        self.model = inner.model

    @property
    def provider_label(self) -> str:
        return self._inner.provider_label

    async def decide(self, state, questions: Mapping[str, Question]) -> Decision:
        import hashlib as _h
        import json as _j
        key = _h.sha256(_j.dumps(
            [self.model, self._s.ai_prompt_version, state,
             {k: v.to_wire() for k, v in questions.items()}],
            sort_keys=True, ensure_ascii=False, default=str,
        ).encode()).hexdigest()

        cached = await self._cache.get("classification", key)
        if cached is not None:
            # Rehydrate typed answers from the cached raw body.
            return self._inner._parse(cached, questions)

        # Estimate worst-case input tokens from the serialized request.
        import math as _m
        approx_chars = len(_j.dumps({"state": state, "questions": {k: v.to_wire() for k, v in questions.items()}}, default=str))
        worst_in = max(1, _m.ceil(approx_chars / 4))
        from app.providers.guard import settle_call
        from app.providers.pricing import worst_case_cost_inr
        worst = worst_case_cost_inr(self.model, worst_in, 0, self._s.usd_inr_rate)
        reservation = await self._ledger.reserve(self.provider_label, self.model, "classification", worst)
        # Settled exactly once: usage.cost (authoritative) or tokens on success
        # and on malformed-but-billed responses; worst case on cancel/timeout.
        decision = await settle_call(
            self._ledger, reservation,
            lambda: self._inner.decide(state, questions),
            model=self.model, usd_inr=self._s.usd_inr_rate,
            worst_in=worst_in, worst_out=0,
            usage_of=lambda d: d.usage,
        )
        await self._cache.put("classification", key, self.model, decision.raw)
        return decision


def get_guarded_classification_client(settings=None, conn=None, **overrides):
    """Jev client wrapped with budget ledger + cache."""
    if settings is None:
        from app.config import get_settings
        settings = get_settings()
    from app.providers.budget import BudgetLedger
    from app.providers.cache import AICache
    inner = get_classification_client(settings, **overrides)
    return GuardedJevClient(
        inner,
        ledger=BudgetLedger(conn, settings=settings),
        cache=AICache(conn, settings=settings),
        settings=settings,
    )


async def check_classification_provider(settings=None, **overrides) -> HealthCheckResult:
    """One cheap real Jev call (a single Noul question, well under $0.0001)."""
    client = get_classification_client(settings, **overrides)
    started = time.perf_counter()
    decision = await client.decide(
        state="The note says: water boils at 100 degrees Celsius at sea level.",
        questions={"is_science": Noul("The note is about a scientific fact.")},
    )
    latency = (time.perf_counter() - started) * 1000
    answer = decision.answers["is_science"]
    assert isinstance(answer, NoulAnswer)
    return HealthCheckResult(
        role="classification",
        provider=client.provider_label,
        model=decision.model,
        ok=True,
        latency_ms=latency,
        detail=f"noul(is_science)={answer.probability:.2f}",
        extra={"cost_usd": decision.usage.cost_usd},
    )
