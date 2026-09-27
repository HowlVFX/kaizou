"""Local NLI inference backend (transformers, CPU by default).

Loads a cross-/bi-encoder sequence-classification model ONCE and runs 3-way
NLI (entailment / neutral / contradiction) over premise→hypothesis pairs.

Design points that matter:
- torch + transformers are an OPTIONAL dependency (the `nli` extra). Importing
  this module without them raises a clear, actionable error — the web image
  can stay lean and never import torch.
- The model is loaded once per process. It is meant to live in the worker
  process, not in multiple Uvicorn web workers (each copy is ~1 GB).
- Label mapping is read from the model config's ``id2label`` and matched BY
  NAME, never by index — the candidate models disagree on label order
  (mDeBERTa is entail/neutral/contra; the deberta cross-encoders are
  contra/entail/neutral). A model whose labels can't be mapped fails loudly.
- Inference is synchronous/CPU-bound; callers offload it with
  ``asyncio.to_thread`` so the event loop is never blocked.
- The revision is pinned for reproducibility.
"""
from __future__ import annotations

import logging
import threading
from typing import Sequence

logger = logging.getLogger(__name__)

_IMPORT_ERROR: Exception | None = None
try:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
except Exception as exc:  # pragma: no cover - exercised only without the extra
    _IMPORT_ERROR = exc


class NLIBackendUnavailable(RuntimeError):
    """torch/transformers aren't installed, or the model failed to load."""


def _require_deps() -> None:
    if _IMPORT_ERROR is not None:
        raise NLIBackendUnavailable(
            "NLI needs torch + transformers, which are not installed. "
            "Install the optional extra:  pip install -e \".[nli]\"  "
            f"(import error: {_IMPORT_ERROR!r})"
        )


# Canonical label names we normalize every model onto.
_ENTAIL, _NEUTRAL, _CONTRA = "entailment", "neutral", "contradiction"


def _build_index_map(id2label: dict[int, str]) -> dict[str, int]:
    """Map canonical label -> this model's output index, by name.

    Raises if any of the three NLI labels is missing, so a mislabeled or
    non-NLI model never silently produces garbage scores.
    """
    name_to_idx: dict[str, int] = {}
    for idx, raw in id2label.items():
        low = str(raw).strip().lower()
        if low.startswith("entail"):
            name_to_idx[_ENTAIL] = int(idx)
        elif low.startswith("neutral"):
            name_to_idx[_NEUTRAL] = int(idx)
        elif low.startswith("contradict"):
            name_to_idx[_CONTRA] = int(idx)
    missing = {_ENTAIL, _NEUTRAL, _CONTRA} - set(name_to_idx)
    if missing:
        raise NLIBackendUnavailable(
            f"model labels {id2label} do not cover the 3 NLI classes; missing {sorted(missing)}"
        )
    return name_to_idx


class TorchNLIBackend:
    """Owns the loaded model + tokenizer. One instance per process."""

    def __init__(self, model_id: str, revision: str, device: str, max_length: int):
        _require_deps()
        self.model_id = model_id
        self.revision = revision
        self._device = device
        self._max_length = max_length
        # The HF fast tokenizer (Rust) is not re-entrant: concurrent calls from
        # worker threads fail with "RuntimeError: Already borrowed". Serialize
        # tokenize + forward pass per backend instance.
        self._lock = threading.Lock()
        try:
            self._tok = AutoTokenizer.from_pretrained(model_id, revision=revision)
            # ``dtype`` replaces the deprecated ``torch_dtype`` in transformers 5.
            self._model = AutoModelForSequenceClassification.from_pretrained(
                model_id, revision=revision, dtype=torch.float32,
            )
            self._model.eval()
            self._model.to(device)
        except Exception as exc:
            raise NLIBackendUnavailable(
                f"failed to load NLI model '{model_id}'@{revision[:8]} on {device}: {exc!r}"
            ) from exc
        self._idx = _build_index_map({int(k): v for k, v in self._model.config.id2label.items()})
        logger.info("NLI model loaded: %s@%s on %s (labels=%s)",
                    model_id, revision[:8], device, self._model.config.id2label)

    def infer(self, pairs: Sequence[tuple[str, str]]) -> list[tuple[float, float, float]]:
        """Run NLI over (premise, hypothesis) pairs.

        Returns a list of (entailment, neutral, contradiction) probabilities,
        in the same order as ``pairs``. Synchronous / CPU-bound — call via
        ``asyncio.to_thread``.
        """
        if not pairs:
            return []
        premises = [p for p, _ in pairs]
        hypotheses = [h for _, h in pairs]
        with self._lock:
            enc = self._tok(
                premises, hypotheses, padding=True, truncation=True,
                max_length=self._max_length, return_tensors="pt",
            ).to(self._device)
            with torch.inference_mode():
                probs = torch.softmax(self._model(**enc).logits, dim=-1)
        e, n, c = self._idx[_ENTAIL], self._idx[_NEUTRAL], self._idx[_CONTRA]
        return [(float(row[e]), float(row[n]), float(row[c])) for row in probs]
