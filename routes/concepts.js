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

    concept.claims = claimsResult.rows;
    concept.edges = edgesResult.rows;
    res.json(concept);
  } catch (err) {
    console.error('Error fetching concept:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
