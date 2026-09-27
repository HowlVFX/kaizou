"""Probes match the learner's level and vocabulary (no AI; fakes only)."""
from __future__ import annotations

import asyncio

from app.probes.generation import ProbeGenerator
from app.probes.service import ProbeService
from app.probes.style import reading_level, unfamiliar_words, vocabulary
from test_ws2_support import FakeDB, FakeEmbedding, FakeGenClient, settings

LEARNER = "11111111-1111-1111-1111-111111111111"
KID_NOTE = ("Plants make their own food. They use sunlight, water and air. "
            "The food is sugar. The green colour in leaves catches the sunlight.")
KID_CLAIMS = ["Plants make their own food.", "Plants use sunlight, water and air.",
              "The food plants make is sugar."]


def test_reading_level_separates_kid_and_technical_text():
    assert reading_level(KID_NOTE) == "very simple"
    tech = ("Photosynthesis is a biochemical process whereby photoautotrophic organisms "
            "convert electromagnetic radiation into chemical energy, synthesising "
            "carbohydrates via the Calvin-Benson cycle in chloroplast stroma.")
    assert reading_level(tech) == "technical"


def test_unfamiliar_words_flags_synonyms_not_inflections():
    vocab = vocabulary(KID_NOTE)
    # 'makes'/'plant' are inflections of the learner's words; 'create'/'produce' are not.
    assert unfamiliar_words("What does a plant make with sunlight?", vocab) == []
    assert unfamiliar_words("What do plants create or produce via photosynthesis?", vocab) == [
        "create", "produce", "photosynthesis"]


def _service(db, gen, emb):
    return ProbeService(db, generator=ProbeGenerator(client=gen), embedding_service=emb,
                        settings=settings())


def _seed():
    db = FakeDB()
    cid = db.add_concept(LEARNER, canonical_label="Plant food", shape="DEFINITION",
                         solo_level="Unistructural")
    emb = FakeEmbedding()
    for i, t in enumerate(KID_CLAIMS):
        db.add_claim(cid, t, order_index=i, embedding=str(emb._vec(t)))
    db.note_bodies = {cid: KID_NOTE}
    return db, cid, emb


def test_note_text_and_level_reach_the_generator():
    db, cid, emb = _seed()
    gen = FakeGenClient([{"prompt_text": "What do plants make?"}])
    asyncio.run(_service(db, gen, emb).generate_probe_for_concept(cid, LEARNER, probe_type="RECALL"))
    prompt = gen.calls[0]["prompt"]
    assert "Reading level: very simple" in prompt
    assert "The green colour in leaves catches the sunlight." in prompt


def test_off_vocabulary_question_is_regenerated_in_learner_words():
    db, cid, emb = _seed()
    fancy = {"prompt_text": "Explain how autotrophic organisms synthesise carbohydrates via photosynthesis."}
    plain = {"prompt_text": "What do plants make, and what do they use to make it?"}
    gen = FakeGenClient([fancy, plain])
    out = asyncio.run(_service(db, gen, emb).generate_probe_for_concept(cid, LEARNER, probe_type="RECALL"))
    assert out["prompt_text"] == plain["prompt_text"]
    assert "used words the learner never wrote" in gen.calls[1]["prompt"]
    assert "autotrophic" in gen.calls[1]["prompt"]


def test_transfer_questions_are_not_vocabulary_gated():
    db, cid, emb = _seed()
    db.concepts[cid]["solo_level"] = "Relational"
    novel = {"prompt_text": "A submarine garden grows under lamps. How would it feed itself?"}
    gen = FakeGenClient([novel])
    out = asyncio.run(_service(db, gen, emb).generate_probe_for_concept(cid, LEARNER, probe_type="NEAR_TRANSFER"))
    assert out["prompt_text"] == novel["prompt_text"] and len(gen.calls) == 1


def test_topic_question_in_learner_words_is_not_a_leak():
    from app.probes.leakage import assess_answer_leakage, content_coverage, per_claim_overlap
    texts = KID_CLAIMS + ["The green stuff in leaves catches the sunlight.",
                          "Plants breathe out air that we need."]
    claims = [c.split() for c in texts]
    # Short on-topic sentences embed near-identically: every claim ~0.9.
    sims = [0.96, 0.92, 0.93, 0.91, 0.91]
    q = "How do plants make their own food?"
    leaked, touched, _ = assess_answer_leakage(sims, per_claim_overlap(q.split(), claims), content_coverage(q, texts))
    assert not leaked and touched <= 2
    # Giving away most of the answer's claims → leak.
    giveaway = "Plants use sunlight, water and air to make sugar, and the green stuff in leaves catches sunlight."
    assert assess_answer_leakage(sims, per_claim_overlap(giveaway.split(), claims), content_coverage(giveaway, texts))[0]
    # Near-verbatim restatement of any claim → leak.
    verbatim = "The green stuff in leaves catches the sunlight"
    assert assess_answer_leakage([0.5] * 5, per_claim_overlap(verbatim.split(), claims))[0]
