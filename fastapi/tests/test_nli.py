"""NLI service + contradiction detection. No model download in the standard
suite: a fake backend returns fixed probabilities. Label mapping is tested
against the torch_backend's name-based mapper (no torch needed).

An optional real-model test runs ONLY if the pinned model is already in the
local HF cache (never triggers a download)."""
from __future__ import annotations

import asyncio
import os

import pytest

from app.config import Settings
from app.grading.contradiction import ContradictionDetector, NLIResult
from app.nli.service import DisabledNLIService, NLIService, NLIUnavailable
from app.nli.torch_backend import _build_index_map, NLIBackendUnavailable


# --- Fake backend: returns (entail, neutral, contra) per pair by a rule. ---
class FakeBackend:
    """Contradiction when hypothesis contains 'NOT', else entailment."""
    def __init__(self):
        self.calls = 0

    def infer(self, pairs):
        self.calls += 1
        out = []
        for _premise, hyp in pairs:
            if "NOT" in hyp.upper():
                out.append((0.02, 0.08, 0.90))   # contradiction
            elif hyp == "neutral":
                out.append((0.10, 0.80, 0.10))
            else:
                out.append((0.90, 0.08, 0.02))    # entailment
        return out


def svc():
    return NLIService(FakeBackend(), batch_size=4)


# --- label mapping (the cross-model gotcha) ---
def test_label_map_by_name_not_index():
    # mDeBERTa order
    m = _build_index_map({0: "entailment", 1: "neutral", 2: "contradiction"})
    assert m == {"entailment": 0, "neutral": 1, "contradiction": 2}
    # deberta cross-encoder order (different!) — must still map correctly by name
    m2 = _build_index_map({0: "contradiction", 1: "entailment", 2: "neutral"})
    assert m2 == {"contradiction": 0, "entailment": 1, "neutral": 2}


def test_label_map_rejects_non_nli_model():
    with pytest.raises(NLIBackendUnavailable):
        _build_index_map({0: "positive", 1: "negative"})


# --- service behavior ---
def test_classify_single_and_direction():
    async def run():
        r = await svc().classify(premise="var is initialised to undefined.",
                                  hypothesis="var is NOT initialised to undefined.")
        assert r.contradiction > r.entailment  # negation -> contradiction
    asyncio.run(run())


def test_batch_preserves_order():
    async def run():
        s = svc()
        pairs = [("p", "entail one"), ("p", "NOT this"), ("p", "neutral")]
        res = await s.classify_batch(pairs)
        assert len(res) == 3
        assert res[0].entailment > 0.5
        assert res[1].contradiction > 0.5
        assert res[2].neutral > 0.5
    asyncio.run(run())


def test_empty_input():
    async def run():
        assert await svc().classify_batch([]) == []
    asyncio.run(run())


def test_disabled_service_raises():
    async def run():
        with pytest.raises(NLIUnavailable):
            await DisabledNLIService().classify("a", "b")
        assert DisabledNLIService().enabled is False
    asyncio.run(run())


# --- contradiction detector integration (batch path) ---
def test_detector_counts_and_flags():
    async def run():
        s = svc()
        report = await ContradictionDetector(s, threshold=0.70).detect(
            source_claims=["A causes B.", "X leads to Y."],
            learner_claims=["A causes B.",              # entail -> not flagged
                            "X does NOT lead to Y."],   # contra -> flagged
        )
        assert report.contradiction_count == 1
        assert report.flagged_pairs[0].learner_index == 1
        # one batch call for all 2x2 pairs
        assert s._backend.calls == 1
    asyncio.run(run())


def test_detector_empty_claims():
    async def run():
        report = await ContradictionDetector(svc()).detect([], ["anything"])
        assert report.contradiction_count == 0
    asyncio.run(run())


# --- optional real-model test: only if pinned model already cached ---
def _model_cached(model_id, revision):
    try:
        from huggingface_hub import try_to_load_from_cache
        # config.json is enough to tell if the snapshot exists locally.
        got = try_to_load_from_cache(model_id, "config.json", revision=revision)
        return isinstance(got, str)
    except Exception:
        return False


_S = Settings(_env_file=None)


@pytest.mark.skipif(
    not _model_cached(_S.nli_model, _S.nli_revision),
    reason="NLI model not in local HF cache; skipping to avoid a large download",
)
def test_real_model_contradiction():
    async def run():
        from app.nli.torch_backend import TorchNLIBackend
        backend = TorchNLIBackend(_S.nli_model, _S.nli_revision, "cpu", _S.nli_max_length)
        s = NLIService(backend, batch_size=8)
        r = await s.classify(
            premise="var declarations are initialised to undefined.",
            hypothesis="var declarations are not initialised to undefined.")
        assert r.contradiction > r.entailment
    asyncio.run(run())


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn(); print("ok", name)
            except Exception as e:
                print("FAIL", name, e)
