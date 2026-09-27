"""WS2 probes: type validation before paid calls, leakage retry loop,
fallbacks, payload validation, snapshot persistence, template wiring,
SOLO_PROBE_MAP immutability. Generation/embeddings are fakes."""
from __future__ import annotations

import asyncio

import pytest

from app.probes.generation import (
    SOLO_PROBE_MAP, ProbeGenerator, ProbeValidationError, fallback_probe, validate_mcq,
)
from app.probes.service import ProbeService, ProbeServiceError
from app.providers.shared.errors import BudgetExhaustedError
from test_ws2_support import FakeDB, FakeEmbedding, FakeGenClient, settings

LEARNER = "11111111-1111-1111-1111-111111111111"
CLAIM_TEXTS = [
    "The client sends a SYN packet to open the connection.",
    "The server replies with a SYN-ACK packet acknowledging it.",
    "The client finishes the handshake with an ACK packet.",
]


def run(coro):
    return asyncio.run(coro)


def seeded(shape="DEFINITION", solo="Unistructural"):
    db = FakeDB()
    cid = db.add_concept(LEARNER, canonical_label="TCP handshake", shape=shape, solo_level=solo)
    emb = FakeEmbedding()
    for i, t in enumerate(CLAIM_TEXTS):
        db.add_claim(cid, t, order_index=i, embedding=str(emb._vec(t)),
                     aliases=["SYN-ACK"] if i == 1 else [])
    return db, cid, emb


class FakeTemplates:
    def __init__(self):
        self.calls = 0

    async def get_or_generate_template(self, **kw):
        self.calls += 1
        return {"structure": {"trunk": [0, 1, 2], "branches": {"retry": [2]}}, "confidence": "stable"}


def service(db, gen, emb=None, templates=None, **s):
    return ProbeService(db, generator=ProbeGenerator(client=gen), embedding_service=emb,
                        template_manager=templates or FakeTemplates(), settings=settings(**s))


def test_select_probe_type_does_not_mutate_global():
    before = {k: tuple(v) for k, v in SOLO_PROBE_MAP.items()}
    gen = ProbeGenerator(client=FakeGenClient([]))
    for _ in range(5):
        t = run(gen.select_probe_type("Prestructural", "PROCEDURAL", ["CLOZE"]))
        assert t in ("CLOZE", "PROCEDURAL")
    assert {k: tuple(v) for k, v in SOLO_PROBE_MAP.items()} == before


def test_select_probe_type_round_robin_lru():
    gen = ProbeGenerator(client=FakeGenClient([]))
    # All eligible used: least recently used (last in most-recent-first list).
    assert run(gen.select_probe_type("Unistructural", "DEFINITION", ["RECALL", "CLOZE"])) == "CLOZE"
    assert run(gen.select_probe_type("Unistructural", "DEFINITION", ["CLOZE"])) == "RECALL"


def test_invalid_probe_type_rejected_before_any_call():
    db, cid, emb = seeded()
    gen = FakeGenClient([])
    with pytest.raises(ProbeServiceError) as ei:
        run(service(db, gen, emb).generate_probe_for_concept(cid, LEARNER, probe_type="ESSAY"))
    assert ei.value.status_code == 422
    assert gen.calls == [] and emb.calls == 0 and db.log == []


def test_foreign_concept_is_404():
    db, cid, emb = seeded()
    with pytest.raises(ProbeServiceError) as ei:
        run(service(db, FakeGenClient([]), emb).generate_probe_for_concept(
            cid, "22222222-2222-2222-2222-222222222222", probe_type="RECALL"))
    assert ei.value.status_code == 404


def test_leak_retry_uses_distinct_variants_and_persists_snapshot():
    db, cid, emb = seeded()
    leaky = {"prompt_text": CLAIM_TEXTS[0]}   # verbatim claim → leaks
    clean = {"prompt_text": "Describe how two machines agree to start talking."}
    gen = FakeGenClient([leaky, clean])
    out = run(service(db, gen, emb).generate_probe_for_concept(cid, LEARNER, probe_type="RECALL"))
    assert [c["variant"] for c in gen.calls] == ["leak-retry-0", "leak-retry-1"]
    assert "rejected because it leaked" in gen.calls[1]["prompt"]
    assert out["retries"] == 1 and not out["leaked"] and not out["fallback"]
    probe = db.probes[out["probe_id"]]
    snap = probe["answer_key_snapshot"]
    assert snap["version"] == 2 and snap["probe_type"] == "RECALL"
    assert [c["text"] for c in snap["claims"]] == CLAIM_TEXTS
    assert snap["claims"][1]["aliases"] == ["SYN-ACK"]


def test_leak_retries_exhausted_falls_back_without_ai():
    db, cid, emb = seeded()
    gen = FakeGenClient([{"prompt_text": CLAIM_TEXTS[0]}] * 3)
    out = run(service(db, gen, emb).generate_probe_for_concept(cid, LEARNER, probe_type="RECALL"))
    assert len(gen.calls) == 3
    assert out["fallback"] and out["retries"] == 3 and not out["leaked"]
    assert out["fallback_reason"] == "leakage_or_validation_retries_exhausted"
    assert "TCP handshake" in out["prompt_text"]


def test_budget_exhausted_falls_back_cleanly():
    db, cid, emb = seeded()
    gen = FakeGenClient([BudgetExhaustedError(2000, 2000, 1)])
    out = run(service(db, gen, emb).generate_probe_for_concept(cid, LEARNER, probe_type="CLOZE"))
    assert out["fallback"] and out["probe_type"] == "CLOZE"
    assert out["fallback_reason"].startswith("provider_error")
    snap = db.probes[out["probe_id"]]["answer_key_snapshot"]
    assert snap["cloze"]["answer"] and snap["cloze"]["answer"] not in out["prompt_text"]


def test_mcq_generation_validated_and_answer_key_hidden():
    db, cid, emb = seeded()
    mcq = {"prompt_text": "Which packet does the server send back first?", "claim_index": 1,
           "options": [
               {"text": "SYN-ACK", "is_correct": True, "misconception_tag": None},
               {"text": "FIN", "is_correct": False, "misconception_tag": "Confuses close with open"},
               {"text": "RST", "is_correct": False, "misconception_tag": "thinks_reset_starts"},
               {"text": "ACK only", "is_correct": False, "misconception_tag": "two_way_handshake"},
           ]}
    gen = FakeGenClient([mcq])
    out = run(service(db, gen, emb).generate_probe_for_concept(cid, LEARNER, probe_type="MISCONCEPTION_MCQ"))
    assert out["probe_type"] == "MISCONCEPTION_MCQ" and len(out["payload"]["options"]) == 4
    assert "correct_index" not in str(out)
    snap = db.probes[out["probe_id"]]["answer_key_snapshot"]
    correct = snap["mcq"]["correct_index"]
    assert out["payload"]["options"][correct] == "SYN-ACK"
    assert "confuses_close_with_open" in snap["mcq"]["distractor_map"].values()


def test_mcq_unmapped_distractor_fails_validation():
    bad = {"prompt_text": "q?", "claim_index": 0, "options": [
        {"text": "a", "is_correct": True, "misconception_tag": None},
        {"text": "b", "is_correct": False, "misconception_tag": None},
        {"text": "c", "is_correct": False, "misconception_tag": "x"},
        {"text": "d", "is_correct": False, "misconception_tag": "y"}]}
    with pytest.raises(ProbeValidationError):
        validate_mcq(bad, 3)


def test_invalid_sort_output_retries_then_falls_back_to_recall():
    db, cid, emb = seeded()
    bad = {"prompt_text": "Sort these", "items": ["a", "b", "c", "d", "e"],
           "mechanism_groups": [{"name": "x", "item_indices": [0, 1, 2, 3, 4]}],
           "surface_groups": [{"name": "y", "item_indices": [0, 1, 2, 3, 4]}]}
    gen = FakeGenClient([bad, bad, bad])
    out = run(service(db, gen, emb).generate_probe_for_concept(cid, LEARNER, probe_type="CONCEPT_SORT"))
    assert len(gen.calls) == 3 and out["fallback"] and out["probe_type"] == "RECALL"


def test_process_trace_uses_template_manager_and_target_branch():
    db, cid, emb = seeded(shape="ORDERED_PROCESS")
    templates = FakeTemplates()
    gen = FakeGenClient([{"prompt_text": "Walk me through what happens when a retry occurs."}])
    out = run(service(db, gen, emb, templates=templates).generate_probe_for_concept(
        cid, LEARNER, probe_type="PROCESS_TRACE"))
    assert templates.calls == 1
    assert out["target_branch"] == "retry"
    assert "'retry'" in gen.calls[0]["prompt"]
    snap = db.probes[out["probe_id"]]["answer_key_snapshot"]
    assert snap["template"]["trunk"] == [0, 1, 2] and snap["target_branch"] == "retry"


def test_stale_concept_version_conflict():
    db, cid, emb = seeded()
    with pytest.raises(ProbeServiceError) as ei:
        run(service(db, FakeGenClient([]), emb).generate_probe_for_concept(
            cid, LEARNER, probe_type="RECALL", concept_version=7))
    assert ei.value.status_code == 409


def test_deterministic_cloze_fallback_hides_answer():
    probe = fallback_probe("CLOZE", {"canonical_label": "x"},
                           [{"text": "The server replies with a SYN-ACK packet.", "aliases": ["SYN-ACK"]}])
    assert probe.cloze["answer"] == "SYN-ACK" and "SYN-ACK" not in probe.prompt_text
    assert "_____" in probe.prompt_text
