const express = require('express');
const verifyToken = require('../middleware/auth');
const { fastapi, sendFastApiError } = require('../services/fastapi');
const router = express.Router();

// learner_id always comes from the verified JWT; any learner_id the client
// puts in the query string or body is never used for scoping.
//
// Review flow:
//   GET  /api/review/queue            -> due concepts (no probes yet)
//   POST /api/review/probe {concept_id, probe_type?}
//        -> { probe_id, concept_id, prompt_text, probe_type, payload }
//        Generates a probe (one AI call, cached; falls back to a hand-written
//        probe if the provider/budget is unavailable). payload carries MCQ
//        `options` / concept-sort `items`, never the answer key.
//   POST /api/review/answer {probe_id, answer_text? | answer?, answer_payload?, confidence_pre?}
//        -> grade result (band, passed, gap hints, memory, mastery, solo_level)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROBE_TYPES = new Set([
  'CLOZE', 'RECALL', 'PROCESS_TRACE', 'PROCEDURAL', 'MISCONCEPTION_MCQ', 'CONCEPT_SORT',
  'PERTURBATION', 'NEAR_TRANSFER', 'FAR_TRANSFER', 'ANALOGY_FORWARD', 'ANALOGY_SIMULATE', 'ANALOGY_BREAKDOWN',
]);

// Learner-visible probe fields only.
function toClientProbe(p) {
  return {
    probe_id: p.probe_id,
    concept_id: p.concept_id,
    concept_version: p.concept_version,
    prompt_text: p.prompt_text,
    probe_type: p.probe_type,
    payload: p.payload || {},
    fallback: Boolean(p.fallback),
  };
}

// Strip internal scoring detail; learners see the band, pass/fail and hints (§5.8.3).
function toClientGrade(g) {
  const gap = g.gap_report || {};
  return {
    attempt_id: g.attempt_id,
    probe_id: g.probe_id,
    probe_type: g.probe_type,
    concept_id: g.concept_id,
    band: g.band,
    passed: g.passed,
    gap_report: {
      missing_claims: (gap.missing_claims || []).map((m) => ({
        claim_index: m.claim_index,
        category: m.category,
        hint: m.hint,
        prerequisite_concept_id: m.prerequisite_concept_id ?? null,
        prerequisite_concept_label: m.prerequisite_concept_label ?? null,
      })),
      correct: gap.correct,
      misconception_tag: gap.misconception_tag,
      sorted_by: gap.sorted_by,
      empty_answer: gap.empty_answer,
    },
    contradiction: g.contradiction,
    mastery: g.mastery ? { mastered: g.mastery.mastered, newly_mastered: g.mastery.newly_mastered } : null,
    solo_level: g.solo_level ? String(g.solo_level).replace(/_/g, ' ') : null,
    next_review_at: g.next_review_at,
  };
}

router.get('/queue', verifyToken, async (req, res) => {
  try {
    const params = { learner_id: req.user.id };
    const size = parseInt(req.query.session_size, 10);
    if (Number.isInteger(size) && size > 0 && size <= 50) params.session_size = size;
    const response = await fastapi.get('/review/queue', { params });
    res.json(response.data);
  } catch (err) {
    sendFastApiError(res, err, 'Failed to load review queue');
  }
});

router.post('/probe', verifyToken, async (req, res) => {
  const { concept_id: conceptId, probe_type: rawType } = req.body || {};
  if (typeof conceptId !== 'string' || !UUID_RE.test(conceptId)) {
    return res.status(400).json({ error: 'concept_id must be a UUID' });
  }
  let probeType;
  if (rawType !== undefined && rawType !== null) {
    probeType = String(rawType).toUpperCase();
    if (!PROBE_TYPES.has(probeType)) return res.status(400).json({ error: 'Invalid probe_type' });
  }
  try {
    const response = await fastapi.post('/probes/generate', {
      concept_id: conceptId,
      learner_id: req.user.id,
      ...(probeType ? { probe_type: probeType } : {}),
    });
    res.json(toClientProbe(response.data));
  } catch (err) {
    sendFastApiError(res, err, 'Failed to prepare a question');
  }
});

router.post('/answer', verifyToken, async (req, res) => {
  const b = req.body || {};
  if (typeof b.probe_id !== 'string' || !UUID_RE.test(b.probe_id)) {
    return res.status(400).json({ error: 'probe_id must be a UUID' });
  }
  const body = { probe_id: b.probe_id };
  const text = b.answer_text ?? b.answer;
  if (text !== undefined && text !== null) {
    if (typeof text !== 'string') return res.status(400).json({ error: 'answer_text must be a string' });
    body.answer_text = text.slice(0, 20000);
  }
  if (b.answer_payload !== undefined && b.answer_payload !== null) {
    if (typeof b.answer_payload !== 'object' || Array.isArray(b.answer_payload)) {
      return res.status(400).json({ error: 'answer_payload must be an object' });
    }
    body.answer_payload = b.answer_payload;
  }
  if (typeof b.confidence_pre === 'number') body.confidence_pre = b.confidence_pre;

  try {
    const response = await fastapi.post('/review/answer', body, { params: { learner_id: req.user.id } });
    res.json(toClientGrade(response.data));
  } catch (err) {
    sendFastApiError(res, err, 'Failed to submit review answer');
  }
});

module.exports = router;
