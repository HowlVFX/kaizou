const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        TRUNC(predicted_recall::numeric, 1) as recall_bucket,
        COUNT(*) as count
      FROM attempts
      GROUP BY TRUNC(predicted_recall::numeric, 1)
      HAVING COUNT(DISTINCT learner_id) >= 5
      ORDER BY recall_bucket
    `);
    
    res.json({ distribution: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
