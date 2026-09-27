"""NLI service — the interface the rest of the app calls.

Implements the ``NLIClassifier`` protocol used by
``app.grading.contradiction.ContradictionDetector``:

    async def classify(premise, hypothesis) -> NLIResult
    async def classify_batch(pairs)         -> list[NLIResult]

🔒 Direction is fixed: premise = trusted source/reference claim,
hypothesis = the claim being checked (e.g. a learner statement).

🔒 NLI provides evidence only. It never grades — the deterministic grading
math interprets the contradiction count. No thresholds are applied here.

Modes:
- enabled: the torch backend is loaded lazily, once, in a worker thread (the
  first load reads ~1 GB and imports torch, which must not block the event
  loop). Inference also runs via ``asyncio.to_thread``, serialized by a
  ``threading.Lock`` because the shared HF tokenizer is not re-entrant
  ("Already borrowed"). Set NLI_PRELOAD=true to load at startup in the
  background (``warm_up``) instead of on the first request.
- disabled (nli_enabled=False), deps missing, or the load failed: classify()
  raises ``NLIUnavailable``. Callers decide how to degrade (the routers
  report an explicit "nli_disabled" flag rather than a silent 0).
"""
from __future__ import annotations

import asyncio
import importlib.util
import logging
import threading
from typing import Callable

from app.grading.contradiction import NLIResult

logger = logging.getLogger(__name__)


class NLIUnavailable(RuntimeError):
    """NLI is disabled or its backend could not be loaded."""


class LazyBackend:
    """Builds the real backend on first use, exactly once, thread-safely.

    ``load()`` is blocking; call it from a worker thread. A failed load is
    remembered (no retry storm of 1 GB loads) and surfaces as NLIUnavailable.
    """

    def __init__(self, factory: Callable[[], object]):
        self._factory = factory
        self._lock = threading.Lock()
        self._backend = None
        self._error: Exception | None = None

    @property
    def failed(self) -> bool:
        return self._error is not None

    @property
    def loaded(self) -> bool:
        return self._backend is not None

    def load(self):
        if self._backend is not None:
            return self._backend
        with self._lock:
            if self._backend is None and self._error is None:
                try:
                    self._backend = self._factory()
                except Exception as exc:
                    # Loud in the log but not fatal: callers see NLIUnavailable.
                    logger.error("NLI backend unavailable, running disabled: %s", exc)
                    self._error = exc
            if self._error is not None:
                raise NLIUnavailable(f"NLI backend failed to load: {self._error}") from self._error
            return self._backend

    def infer(self, pairs):
        return self.load().infer(pairs)


class NLIService:
    """Owns an NLI backend and exposes async single/batch classification."""

    def __init__(self, backend, *, batch_size: int = 16):
        self._backend = backend
        self._batch_size = batch_size
        # One inference at a time per service: the tokenizer/model are shared.
        self._infer_lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        if self._backend is None:
            return False
        return not getattr(self._backend, "failed", False)

    def _infer_blocking(self, chunk):
        with self._infer_lock:
            return self._backend.infer(chunk)

    async def warm_up(self) -> bool:
        """Load the model off the event loop. True if it is ready."""
        if not self.enabled:
            return False
        load = getattr(self._backend, "load", None)
        if load is None:
            return True
        try:
            await asyncio.to_thread(load)
            return True
        except NLIUnavailable:
            return False

    async def classify(self, premise: str, hypothesis: str) -> NLIResult:
        (result,) = await self.classify_batch([(premise, hypothesis)])
        return result

    async def classify_batch(self, pairs) -> list[NLIResult]:
        """Classify many (premise, hypothesis) pairs. Order preserved."""
        pairs = list(pairs)
        if not pairs:
            return []
        if not self.enabled:
            raise NLIUnavailable(
                "NLI is disabled or unavailable (NLI_ENABLED=false, the 'nli' extra "
                "is not installed, or the model failed to load). See fastapi/README.md."
            )
        out: list[NLIResult] = []
        for start in range(0, len(pairs), self._batch_size):
            chunk = pairs[start:start + self._batch_size]
            # CPU-bound inference (and a first-time model load) off the event loop.
            probs = await asyncio.to_thread(self._infer_blocking, chunk)
            out.extend(NLIResult(entailment=e, neutral=n, contradiction=c) for e, n, c in probs)
        return out


class DisabledNLIService(NLIService):
    """A service that is always off — classify raises NLIUnavailable."""

    def __init__(self):
        super().__init__(backend=None)


# --------------------------------------------------------------------------
# Factory — returns immediately; the model loads lazily off the event loop.
# --------------------------------------------------------------------------
_INSTANCE: NLIService | None = None
_INSTANCE_LOCK = threading.Lock()


def _deps_installed() -> bool:
    return all(importlib.util.find_spec(m) is not None for m in ("torch", "transformers"))


def _torch_factory(settings) -> Callable[[], object]:
    def build():
        # Imported here so torch's import cost is paid in the loader thread.
        from app.nli.torch_backend import TorchNLIBackend
        return TorchNLIBackend(
            model_id=settings.nli_model, revision=settings.nli_revision,
            device=settings.nli_device, max_length=settings.nli_max_length,
        )
    return build


def get_nli_service(settings=None, conn=None) -> NLIService:
    """Return the process-wide NLI service. Never blocks on the model load.

    When ``conn`` is provided, the service is wrapped with the reuse cache so
    repeated (premise, hypothesis) pairs are not recomputed.
    """
    global _INSTANCE
    if settings is None:
        from app.config import get_settings
        settings = get_settings()

    if _INSTANCE is None:
        with _INSTANCE_LOCK:
            if _INSTANCE is None:
                if not settings.nli_enabled:
                    logger.info("NLI disabled (NLI_ENABLED=false).")
                    _INSTANCE = DisabledNLIService()
                elif not _deps_installed():
                    logger.error("NLI backend unavailable, running disabled: torch/transformers "
                                 "not installed (pip install -e \".[nli]\")")
                    _INSTANCE = DisabledNLIService()
                else:
                    _INSTANCE = NLIService(LazyBackend(_torch_factory(settings)),
                                           batch_size=settings.nli_batch_size)

    if conn is not None and _INSTANCE.enabled:
        from app.nli.cache import CachedNLIService
        return CachedNLIService(_INSTANCE, conn=conn, settings=settings)
    return _INSTANCE


async def warm_up_nli(settings=None) -> bool:
    """Load the NLI model in a worker thread (for NLI_PRELOAD at startup)."""
    try:
        ready = await get_nli_service(settings).warm_up()
    except Exception:  # never let a warm-up failure take the app down
        logger.exception("NLI warm-up failed")
        return False
    logger.info("NLI warm-up %s", "complete" if ready else "skipped (NLI unavailable)")
    return ready


def reset_nli_service() -> None:
    """Drop the cached instance (used by tests)."""
    global _INSTANCE
    _INSTANCE = None
