"""WS2 grading: per-type dispatch, payload-only grading, cloze, gap-report
redaction, settings-driven constants, contradiction wiring. No AI calls."""
from __future__ import annotations

import asyncio

import pytest

from app.grading.answer_key import build_snapshot, parse_answer_key
from app.grading.composite import calculate_composite_score, classify_understanding_band
from app.grading.concept_sort import adjusted_rand_index, principle_ratio
from app.grading.engine import GradingInputError, grade_answer
from app.grading.gap_report import GapReportBuilder, redacted_cue
from test_ws2_support import FakeEmbedding, settings

CONCEPT = {"id": "c1", "version": 1, "canonical_label": "TCP handshake", "shape": "ORDERED_PROCESS"}
CLAIMS = [
    {"id": "k0", "text": "The client sends a SYN packet to the server.", "order_index": 0,
     "is_transition": True, "aliases": []},
    {"id": "k1", "text": "The server replies with a SYN-ACK packet.", "order_index": 1,
     "is_transition": True, "aliases": ["SYN-ACK", "synack"]},
    {"id": "k2", "text": "The client answers with a final ACK packet.", "order_index": 2,
     "is_transition": False, "aliases": []},
]


def run(coro):
    return asyncio.run(coro)


def key_for(ptype, **extra):
    return parse_answer_key(build_snapshot(concept=CONCEPT, claims=CLAIMS, probe_type=ptype, **extra), ptype)


class NoEmbeddings:
    """Fails the test if the grader touches embeddings."""
    async def embed(self, texts):
        raise AssertionError("embeddings must not be used for this probe type")

    async def claims(self, key):
        raise AssertionError("embeddings must not be used for this probe type")


def grade(key, text=None, payload=None, s=None, emb=None, get_nli=None):
    s = s or settings()
    if emb is None:
        guard = NoEmbeddings()
        embed_texts, claim_embeddings = guard.embed, guard.claims
    else:
        async def claim_embeddings(k):
            return await emb.compute_batch_embeddings([c.text for c in k.claims])
        embed_texts = emb.compute_batch_embeddings
    return run(grade_answer(key, answer_text=text, answer_payload=payload, settings=s,
                            embed_texts=embed_texts, claim_embeddings=claim_embeddings,
                            get_nli=get_nli))


# --- MCQ: payload only, deterministic -------------------------------------
MCQ = {"correct_index": 2, "n_options": 4,
       "distractor_map": {"0": "confuses_syn_with_ack", "1": "thinks_two_way", "3": "server_initiates"}}


def test_mcq_correct_payload_no_ai():
    out = grade(key_for("MISCONCEPTION_MCQ", mcq=MCQ, target_claim_index=1), payload={"selected_index": 2})
    assert out.mode == "mcq" and out.composite == 1.0 and out.passed
    assert out.misconception_tags == []
    assert out.meta["total_matched"] == 1


def test_mcq_wrong_records_misconception_tag():
    out = grade(key_for("MISCONCEPTION_MCQ", mcq=MCQ), payload={"selected_option": "B"})
    assert out.composite == 0.0 and not out.passed
    assert out.misconception_tags == ["thinks_two_way"]
    assert out.gap_report["misconception_tag"] == "thinks_two_way"
    assert "correct_index" not in str(out.gap_report)


def test_mcq_invalid_selection_is_422_error():
    with pytest.raises(GradingInputError):
        grade(key_for("MISCONCEPTION_MCQ", mcq=MCQ), payload={"selected_index": 9})


def test_mcq_empty_is_failed_recall():
    out = grade(key_for("MISCONCEPTION_MCQ", mcq=MCQ), payload=None, text="")
    assert out.mode == "empty" and not out.passed and out.band == "Not_Yet_Engaged"


# --- CONCEPT_SORT: ARI + principle ratio ----------------------------------
SORT = {"n_items": 6, "mechanism_groups": [[0, 1, 2], [3, 4, 5]], "surface_groups": [[0, 3], [1, 4], [2, 5]]}


def test_ari_basics():
    assert adjusted_rand_index([0, 0, 1, 1], [5, 5, 7, 7]) == pytest.approx(1.0)
    assert adjusted_rand_index([0, 0, 1, 1], [0, 1, 0, 1]) < 0.0
    assert principle_ratio(0.0, 0.0) is None
    assert principle_ratio(1.0, 0.0) == 1.0


def test_concept_sort_by_mechanism():
    out = grade(key_for("CONCEPT_SORT", sort=SORT), payload={"groups": [[2, 1, 0], [5, 4, 3]]})
    assert out.mode == "concept_sort"
    assert out.ari_mechanism == pytest.approx(1.0)
    assert out.principle_ratio == pytest.approx(1.0)
    assert out.gap_report["sorted_by"] == "mechanism"
    assert out.passed


def test_concept_sort_by_surface_fails():
    out = grade(key_for("CONCEPT_SORT", sort=SORT), payload={"assignment": ["a", "b", "c", "a", "b", "c"]})
    assert out.ari_surface == pytest.approx(1.0)
    assert out.composite == 0.0 and not out.passed
    assert out.gap_report["sorted_by"] == "surface"


def test_concept_sort_bad_partition():
    with pytest.raises(GradingInputError):
        grade(key_for("CONCEPT_SORT", sort=SORT), payload={"groups": [[0, 1], [1, 2, 3, 4, 5]]})


# --- CLOZE: short answers graded by exact / alias match -------------------
def test_cloze_short_alias_match_is_graded():
    key = key_for("CLOZE", cloze={"answer": "SYN-ACK", "aliases": []}, target_claim_index=1)
    out = grade(key, text="synack")          # claim alias, ≤10 chars
    assert out.mode == "cloze_exact" and out.passed and out.band == "Full"
    out2 = grade(key, text=" syn ack ")      # normalised punctuation/case
    assert out2.passed


def test_cloze_short_wrong_is_graded_not_skipped():
    key = key_for("CLOZE", cloze={"answer": "SYN-ACK", "aliases": []}, target_claim_index=1)
    out = grade(key, text="FIN")
    assert out.mode == "cloze_exact" and out.composite == 0.0 and not out.passed
    assert out.gap_report["correct"] is False


def test_cloze_long_answer_falls_back_to_target_claim():
    key = key_for("CLOZE", cloze={"answer": "SYN-ACK", "aliases": []}, target_claim_index=1)
    out = grade(key, text="The server replies with a SYN-ACK packet.", emb=FakeEmbedding())
    assert out.mode == "claim_coverage"
    assert out.meta["total_required"] == 1 and out.coverage == 1.0


# --- free text / empty -----------------------------------------------------
def test_free_text_uses_snapshot_and_redacts_gaps():
    out = grade(key_for("PROCESS_TRACE"), text="The client sends a SYN packet to the server.",
                emb=FakeEmbedding())
    assert out.mode == "claim_coverage"
    assert out.meta["total_matched"] == 1 and out.meta["matched_claim_ids"] == ["k0"]
    assert out.meta["all_transitions_matched"] is False
    blob = str(out.gap_report)
    for c in CLAIMS[1:]:
        assert c["text"] not in blob
    assert {m["claim_index"] for m in out.gap_report["missing_claims"]} == {1, 2}
    assert out.contradiction["checked"] is False and out.contradiction["nli_disabled"] is True


def test_short_free_text_is_still_graded():
    out = grade(key_for("RECALL"), text="SYN-ACK", emb=FakeEmbedding())
    assert out.mode == "claim_coverage" and out.meta["total_matched"] == 1  # alias hit


def test_empty_answer_is_failed_recall():
    out = grade(key_for("RECALL"), text="   ")
    assert out.mode == "empty" and out.composite == 0.0 and not out.passed
    assert out.gap_report["empty_answer"] is True


def test_branch_leakage_comes_from_snapshot_not_payload():
    claims = [dict(c) for c in CLAIMS]
    claims[0]["branch_id"], claims[1]["branch_id"], claims[2]["branch_id"] = "a", "b", "b"
    snap = build_snapshot(concept=CONCEPT, claims=claims, probe_type="PROCESS_TRACE", target_branch="b")
    key = parse_answer_key(snap, "PROCESS_TRACE")
    out = grade(key, text="The client sends a SYN packet to the server.",
                payload={"target_branch": None}, emb=FakeEmbedding())
    assert out.branch_leakage > 0.0
    assert "branch_leakage" in out.misconception_tags


# --- contradiction via NLI -------------------------------------------------
class FakeNLI:
    enabled = True

    async def classify_batch(self, pairs):
        from app.grading.contradiction import NLIResult
        return [NLIResult(0.02, 0.08, 0.95) if "NOT" in h else NLIResult(0.9, 0.08, 0.02)
                for _p, h in pairs]


def test_contradiction_runs_and_feeds_misconceptions():
    out = grade(key_for("RECALL"), text="The server does NOT reply with a SYN-ACK packet.",
                emb=FakeEmbedding(), get_nli=lambda: FakeNLI())
    assert out.contradiction["checked"] is True
    assert out.contradiction["contradiction_count"] == 1
    assert any(t.startswith("contradiction:") for t in out.misconception_tags)
    assert out.gap_report["contradiction_count"] == 1


# --- settings-driven constants --------------------------------------------
def test_composite_and_bands_accept_settings_weights():
    assert calculate_composite_score(1.0, 0.0, None, 0.0, 0.0, w_coverage=1.0, w_precision=1.0) == pytest.approx(0.5)
    assert classify_understanding_band(0.7, True, band_full=0.6) == "Full"
    s = settings(pass_threshold=0.99)
    out = grade(key_for("RECALL"), text="The client sends a SYN packet to the server.", s=s, emb=FakeEmbedding())
    assert not out.passed


def test_gap_report_serialisation_hides_claim_text():
    report = GapReportBuilder().build(
        matched_claims=[False], answer_key_claims=["Hoisting moves var declarations to the top"],
        weights=[1.0])
    d = report.to_dict()
    assert "claim_text" not in d["missing_claims"][0]
    assert "Hoisting moves var" not in str(d)
    assert d["missing_claims"][0]["hint"].startswith("Hoisting moves …")
    assert redacted_cue("Word") == "… (1 word)"


def test_legacy_snapshot_parses():
    key = parse_answer_key({"claims": ["a claim here"], "probe_type": "RECALL"}, "RECALL")
    assert key.is_legacy and key.claims[0].text == "a claim here"
