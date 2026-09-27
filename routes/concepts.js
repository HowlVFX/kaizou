const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const { soloToUi } = require('../services/solo');
const { computeRecall } = require('../services/recall');
const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Explicit columns: label_embedding (1536 floats) is never sent to clients.
const CONCEPT_COLS = `
  c.id, c.canonical_label, c.track, c.shape, c.category, c.status, c.version,
  c.c_struct, c.c_bloom, c.c_0, c.c_current, c.n_req, c.solo_level,
  c.probe_eligible, c.source_trust_tier, c.created_at`;
const MEMORY_COLS = 'm.half_life, m.streak, m.attempts, m.passes, m.last_reviewed, m.decay_exempt, m.mastered_at';

function toApiConcept(row, now = Date.now()) {
  return {
    ...row,
    solo_level: soloToUi(row.solo_level),
    recall: computeRecall(row.last_reviewed, row.half_life, row.decay_exempt, now),
  };
}

// pg returns REAL/NUMERIC columns as strings; coerce to a bounded [0,1] score.
function toScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// A 0..100 int from a 0..1 score (null -> 0). Depth dimensions are honest zeros
// when the learner has never taken a relevant probe.
function pct(score) {
  return score === null ? 0 : Math.round(score * 100);
}

// Depth "evidence" (6 dimensions, ints 0..100) + "assessment_evidence"
// (4 categories: 'demonstrated' | 'developing' | 'none') derived from the
// learner's graded attempts on this concept, joined to their probe types.
//
// Each attempt row here is { type, coverage, ordering, precision_score,
// verbatim, delta_score, composite_score, principle_ratio, ari_mechanism,
// passed }. We pick the BEST (max) relevant signal per dimension across all
// of the learner's attempts, so improvement over retests is reflected.
//
// evidence mapping (best relevant attempt, ×100):
//   definition     ← CLOZE/RECALL coverage
//   mechanism      ← PROCESS_TRACE composite_score
//   contrast       ← CONCEPT_SORT principle_ratio, else its ari_mechanism
//   boundary       ← PERTURBATION delta_score
//   application    ← NEAR_TRANSFER composite_score
//   counterfactual ← FAR_TRANSFER composite_score, else PERTURBATION (1 - false_inv)
//                    approximated by PERTURBATION delta_score when no far transfer
//
// assessment_evidence mapping (per category, over the relevant probe types):
//   demonstrated if a passed attempt exists, developing if attempted but never
//   passed, none if never attempted.
const TRANSFER_TYPES = new Set(['NEAR_TRANSFER', 'FAR_TRANSFER', 'ANALOGY_FORWARD', 'ANALOGY_SIMULATE', 'ANALOGY_BREAKDOWN']);

function deriveEvidence(attempts) {
  // best[dimension] holds the max 0..1 signal seen so far.
  const best = {
    definition: null,
    mechanism: null,
    contrast: null,
    boundary: null,
    application: null,
    counterfactual: null,
  };
  const bump = (dim, score) => {
    if (score === null) return;
    if (best[dim] === null || score > best[dim]) best[dim] = score;
  };

  for (const a of attempts) {
    switch (a.type) {
      case 'CLOZE':
      case 'RECALL':
        bump('definition', toScore(a.coverage));
        break;
      case 'PROCESS_TRACE':
        bump('mechanism', toScore(a.composite_score));
        break;
      case 'CONCEPT_SORT': {
        const c = toScore(a.principle_ratio);
        bump('contrast', c !== null ? c : toScore(a.ari_mechanism));
        break;
      }
      case 'PERTURBATION':
        bump('boundary', toScore(a.delta_score));
        // Counterfactual falls back to perturbation when no far transfer exists.
        bump('counterfactual', toScore(a.delta_score));
        break;
      case 'NEAR_TRANSFER':
        bump('application', toScore(a.composite_score));
        break;
      case 'FAR_TRANSFER':
        bump('counterfactual', toScore(a.composite_score));
        break;
      default:
        break;
    }
  }

  return {
    definition: pct(best.definition),
    mechanism: pct(best.mechanism),
    contrast: pct(best.contrast),
    boundary: pct(best.boundary),
    application: pct(best.application),
    counterfactual: pct(best.counterfactual),
  };
}

function deriveAssessment(attempts) {
  // For each category track whether the learner attempted / passed its types.
  const cats = {
    recall: { types: new Set(['RECALL', 'CLOZE']), attempted: false, passed: false },
    processTrace: { types: new Set(['PROCESS_TRACE']), attempted: false, passed: false },
    counterfactual: { types: new Set(['PERTURBATION']), attempted: false, passed: false },
    transfer: { types: TRANSFER_TYPES, attempted: false, passed: false },
  };
  for (const a of attempts) {
    for (const key of Object.keys(cats)) {
      const cat = cats[key];
      if (cat.types.has(a.type)) {
        cat.attempted = true;
        if (a.passed) cat.passed = true;
      }
    }
  }
  const label = (c) => (c.passed ? 'demonstrated' : c.attempted ? 'developing' : 'none');
  return {
    recall: label(cats.recall),
    processTrace: label(cats.processTrace),
    counterfactual: label(cats.counterfactual),
    transfer: label(cats.transfer),
  };
}

// GET all concepts for the authenticated learner
router.get('/', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT ${CONCEPT_COLS}, ${MEMORY_COLS}
      FROM concepts c
      LEFT JOIN memory_states m ON c.id = m.concept_id AND c.learner_id = m.learner_id
      WHERE c.learner_id = $1
    `;
    const result = await db.query(query, [req.user.id]);
    const now = Date.now();
    res.json(result.rows.map((r) => toApiConcept(r, now)));
  } catch (err) {
    console.error('Error fetching concepts:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET concepts with status UNRESOLVED_PREREQUISITE (gaps to fill)
router.get('/gaps/list', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT ${CONCEPT_COLS} FROM concepts c
      WHERE c.learner_id = $1 AND c.status = 'UNRESOLVED_PREREQUISITE'
    `;
    const result = await db.query(query, [req.user.id]);
    res.json(result.rows.map((r) => ({ ...r, solo_level: soloToUi(r.solo_level) })));
  } catch (err) {
    console.error('Error fetching concept gaps:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET a specific concept with claims (current version) and memory state
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Concept not found' });
    const conceptQuery = `
      SELECT ${CONCEPT_COLS}, ${MEMORY_COLS}
      FROM concepts c
      LEFT JOIN memory_states m ON c.id = m.concept_id AND c.learner_id = m.learner_id
      WHERE c.id = $1 AND c.learner_id = $2
    `;
    const conceptResult = await db.query(conceptQuery, [req.params.id, req.user.id]);
    if (conceptResult.rows.length === 0) return res.status(404).json({ error: 'Concept not found' });
    const concept = toApiConcept(conceptResult.rows[0]);

    // Ownership was checked above; claims are also pinned to the current
    // concept version (claims are immutable per version). No embeddings.
    const claimsResult = await db.query(
      `SELECT id, concept_version, text, order_index, is_transition, is_load_bearing,
              branch_id, weight, aliases, created_at
       FROM claims WHERE concept_id = $1 AND concept_version = $2
       ORDER BY order_index ASC NULLS LAST`,
      [req.params.id, concept.version]
    );

    const edgesResult = await db.query(
      `SELECT source_id, target_id, type, weight, confidence, flag
       FROM edges WHERE (source_id = $1 OR target_id = $1) AND learner_id = $2`,
      [req.params.id, req.user.id]
    );

    // Graded attempts for THIS learner on THIS concept (all versions), joined
    // to their probe type. Scoped by learner_id + concept_id per ownership.
    const attemptsResult = await db.query(
      `SELECT p.type, a.coverage, a.ordering, a.precision_score, a.verbatim,
              a.delta_score, a.composite_score, a.principle_ratio, a.ari_mechanism, a.passed
       FROM attempts a
       JOIN probes p ON p.id = a.probe_id
       WHERE a.learner_id = $1 AND a.concept_id = $2`,
      [req.user.id, req.params.id]
    );

    // Process trunk: process_templates.structure->'trunk' is an ordered list of
    // claim indices into the current-version claims (ordered by order_index).
    const templateResult = await db.query(
      `SELECT structure FROM process_templates
       WHERE concept_id = $1 AND concept_version = $2`,
      [req.params.id, concept.version]
    );

    const orderedClaims = claimsResult.rows.map((c) => c.text);
    let processSteps = [];
    const structure = templateResult.rows[0] && templateResult.rows[0].structure;
    const trunk = structure && Array.isArray(structure.trunk) ? structure.trunk : null;
    if (trunk) {
      processSteps = trunk
        .map((idx) => orderedClaims[Number(idx)])
        .filter((t) => typeof t === 'string' && t.length > 0);
    }

    concept.claims = claimsResult.rows;
    concept.edges = edgesResult.rows;
    concept.evidence = deriveEvidence(attemptsResult.rows);
    concept.assessment_evidence = deriveAssessment(attemptsResult.rows);
    concept.process = processSteps;
    res.json(concept);
  } catch (err) {
    console.error('Error fetching concept:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
