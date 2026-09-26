const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.trust_tier,
        COUNT(DISTINCT s.id) as total_sources,
        AVG(v.source_coverage) as avg_coverage,
        COUNT(DISTINCT c.learner_id) as learner_count
      FROM sources s
      LEFT JOIN validations v ON v.source_id = s.id
      JOIN concepts c ON c.id = s.concept_id
      GROUP BY s.trust_tier
      HAVING COUNT(DISTINCT c.learner_id) >= 5
    `);
    
    res.json({ distribution: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
