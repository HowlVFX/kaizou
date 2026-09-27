const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const { soloToUi } = require('../services/solo');
const { computeRecall } = require('../services/recall');
const router = express.Router();

// Graph payload is deliberately slim: no embeddings (1536 floats per concept).
//   node: { id, label, canonical_label, category, status, track, analogy_of,
//           summary, solo_level,
//           recall, half_life, last_reviewed, claims_count, x, y }
//   edge: { source_id, target_id, type, weight }
// recall = 2^(-dt_days / half_life_days), null if never reviewed (1.0 if
// decay_exempt). summary: concepts have no summary column yet -> null.
// x/y: no stored layout -> null (client lays out).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EDGE_COLS = 'source_id, target_id, type, weight';

router.get('/', verifyToken, async (req, res) => {
  try {
    const conceptsResult = await db.query(
      `SELECT c.id, c.canonical_label, c.category, c.status, c.solo_level, c.track,
              (SELECT e.target_id FROM edges e
                WHERE e.source_id = c.id AND e.type = 'ANALOGY_OF' LIMIT 1) AS analogy_of,
              c.is_bedrock, c.level_band, c.teaser, c.simplification_note,
              (c.deeper_question IS NOT NULL) AS has_deeper_step,
              EXISTS (SELECT 1 FROM edges e JOIN concepts d ON d.id = e.target_id
                      WHERE e.source_id = c.id AND e.type = 'EXPLAINED_BY'
                        AND d.status = 'VERIFIED_CONCEPT') AS upgraded,
              m.half_life, m.last_reviewed, m.decay_exempt,
              (SELECT COUNT(*)::int FROM claims cl
                WHERE cl.concept_id = c.id AND cl.concept_version = c.version) AS claims_count
       FROM concepts c
       LEFT JOIN memory_states m ON m.concept_id = c.id AND m.learner_id = c.learner_id
       WHERE c.learner_id = $1`,
      [req.user.id]
    );
    const edgesResult = await db.query(`SELECT ${EDGE_COLS} FROM edges WHERE learner_id = $1`, [req.user.id]);

    const now = Date.now();
    const nodes = conceptsResult.rows.map((c) => ({
      id: c.id,
      label: c.canonical_label,
      canonical_label: c.canonical_label,
      category: c.category,
      status: c.status,
      track: c.track,
      // Concept this node is an analogy for (ANALOGY_OF target), if any.
      analogy_of: c.analogy_of ?? null,
      // Go deeper: bedrock = nothing deeper; upgraded = a deeper explanation
      // of this node has been learnt (its note can optionally be updated).
      is_bedrock: Boolean(c.is_bedrock),
      upgraded: Boolean(c.upgraded),
      has_deeper_step: Boolean(c.has_deeper_step),
      level_band: c.level_band ?? null,
      teaser: c.teaser ?? null,
      simplification_note: c.simplification_note ?? null,
      summary: null,
      solo_level: soloToUi(c.solo_level),
      recall: computeRecall(c.last_reviewed, c.half_life, c.decay_exempt, now),
      half_life: c.half_life ?? null,
      last_reviewed: c.last_reviewed ?? null,
      claims_count: c.claims_count,
      x: null,
      y: null,
    }));
    res.json({ nodes, edges: edgesResult.rows });
  } catch (err) {
    console.error('Error fetching graph:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/edges', verifyToken, async (req, res) => {
  try {
    const edgesResult = await db.query(`SELECT ${EDGE_COLS} FROM edges WHERE learner_id = $1`, [req.user.id]);
    res.json(edgesResult.rows);
  } catch (err) {
    console.error('Error fetching edges:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/neighbors/:conceptId', verifyToken, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.conceptId)) return res.json([]);
    const edgesResult = await db.query(
      `SELECT ${EDGE_COLS} FROM edges WHERE (source_id = $1 OR target_id = $1) AND learner_id = $2`,
      [req.params.conceptId, req.user.id]
    );
    res.json(edgesResult.rows);
  } catch (err) {
    console.error('Error fetching neighbors:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
