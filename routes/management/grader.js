const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    // Grader reliability metrics, subject to the privacy floor (sample_size >= 5).
    const result = await db.query(`
      SELECT metric_key, value, sample_size, window_start, window_end
      FROM portal_aggregates
      WHERE (metric_key IN ('kappa', 'brier_score') OR metric_key LIKE '%grader%')
        AND sample_size >= 5
    `);

    res.json({ metrics: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
