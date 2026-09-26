const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

// GET all concepts for the authenticated learner
router.get('/', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT c.*, m.half_life, m.streak, m.attempts, m.last_reviewed, m.decay_exempt, m.mastered_at
      FROM concepts c
      LEFT JOIN memory_states m ON c.id = m.concept_id AND c.learner_id = m.learner_id
      WHERE c.learner_id = $1
    `;
    const result = await db.query(query, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET a specific concept with claims and memory state
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const conceptQuery = `
      SELECT c.*, m.half_life, m.streak, m.attempts, m.last_reviewed, m.decay_exempt, m.mastered_at
      FROM concepts c
      LEFT JOIN memory_states m ON c.id = m.concept_id AND c.learner_id = m.learner_id
      WHERE c.id = $1 AND c.learner_id = $2
    `;
    const conceptResult = await db.query(conceptQuery, [req.params.id, req.user.id]);
    if (conceptResult.rows.length === 0) return res.status(404).json({ error: 'Concept not found' });
    
    const claimsQuery = `SELECT * FROM claims WHERE concept_id = $1 ORDER BY order_index ASC`;
    const claimsResult = await db.query(claimsQuery, [req.params.id]);

    const edgesQuery = `SELECT * FROM edges WHERE source_id = $1 OR target_id = $1`;
    const edgesResult = await db.query(edgesQuery, [req.params.id]);

    const concept = conceptResult.rows[0];
    concept.claims = claimsResult.rows;
    concept.edges = edgesResult.rows;

    res.json(concept);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET concepts with status UNRESOLVED_PREREQUISITE (gaps to fill)
router.get('/gaps/list', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT * FROM concepts
      WHERE learner_id = $1 AND status = 'UNRESOLVED_PREREQUISITE'
    `;
    const result = await db.query(query, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
