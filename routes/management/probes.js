const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        p.id as probe_id,
        p.type,
        AVG(a.composite_score) as avg_score,
        COUNT(a.id) as attempt_count,
        COUNT(DISTINCT a.learner_id) as learner_count
      FROM probes p
      JOIN attempts a ON a.probe_id = p.id
      GROUP BY p.id, p.type
      HAVING COUNT(DISTINCT a.learner_id) >= 5
      ORDER BY attempt_count DESC
    `);
    
    res.json({ probes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
