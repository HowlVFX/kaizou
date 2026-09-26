const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const metrics = await db.query(`
      SELECT 
        AVG(score) as avg_score,
        COUNT(*) as total_evals
      FROM probes
      HAVING COUNT(DISTINCT learner_id) >= 5
    `);

    res.json({
      metrics: metrics.rows[0] || {}
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

module.exports = router;
