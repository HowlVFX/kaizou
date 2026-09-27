"""Reuse cache for NLI results (DB-backed via ai_cache, no Redis).

Wraps an NLIService so repeated (premise, hypothesis) pairs are not recomputed.
Key = nli_key(premise, hypothesis, model, revision, preprocessing_version), so
changing the model, its revision, or preprocessing invalidates automatically.

NLI is local (no API cost), but contradiction detection is O(source × learner)
pairs, so caching avoids redundant CPU on re-grades of the same claims.
"""
from __future__ import annotations

from app.grading.contradiction import NLIResult
from app.nli.service import NLIService
from app.providers.cache import AICache, nli_key


class CachedNLIService:
    """NLIService decorator that serves hits from ai_cache."""

    def __init__(self, inner: NLIService, *, conn, settings):
        self._inner = inner
        self._cache = AICache(conn, settings=settings)
        self._model = settings.nli_model
        self._rev = settings.nli_revision
        self._prep = settings.nli_preprocessing_version

    @property
    def enabled(self) -> bool:
        return self._inner.enabled

    def _key(self, premise: str, hypothesis: str) -> str:
        return nli_key(premise=premise, hypothesis=hypothesis,
                       model=self._model, revision=self._rev,
                       preprocessing_version=self._prep)

    async def classify(self, premise: str, hypothesis: str) -> NLIResult:
        (r,) = await self.classify_batch([(premise, hypothesis)])
        return r

    async def classify_batch(self, pairs) -> list[NLIResult]:
        pairs = list(pairs)
        if not pairs:
            return []
        results: list[NLIResult | None] = [None] * len(pairs)
        to_compute: list[int] = []

        for i, (p, h) in enumerate(pairs):
            hit = await self._cache.get("nli", self._key(p, h))
            if hit is not None:
                results[i] = NLIResult(**hit)
            else:
                to_compute.append(i)

        if to_compute:
            computed = await self._inner.classify_batch([pairs[i] for i in to_compute])
            for idx, res in zip(to_compute, computed):
                results[idx] = res
                p, h = pairs[idx]
                await self._cache.put("nli", self._key(p, h), self._model, {
                    "entailment": res.entailment,
                    "neutral": res.neutral,
                    "contradiction": res.contradiction,
                })

        return [r for r in results if r is not None]
