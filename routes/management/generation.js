const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const claims = await db.query(`
      SELECT COUNT(*) as total_claims
      FROM claims
      HAVING COUNT(DISTINCT learner_id) >= 5
    `);

    const validations = await db.query(`
      SELECT 
        SUM(CASE WHEN is_agreed THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as agreement_rate
      FROM validations
      HAVING COUNT(DISTINCT learner_id) >= 5
    `);

    res.json({
      total_claims: claims.rows[0]?.total_claims || 0,
      agreement_rate: validations.rows[0]?.agreement_rate || null
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

module.exports = router;
