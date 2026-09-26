const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const eceResult = await db.query(`
      SELECT 
        AVG(ABS(predicted_prob - actual_recall)) as ece,
        COUNT(DISTINCT learner_id) as num_learners
      FROM memory_states
      HAVING COUNT(DISTINCT learner_id) >= 5
    `);
    
    const halfLifeResult = await db.query(`
      SELECT 
        AVG(half_life) as avg_half_life,
        COUNT(DISTINCT learner_id) as num_learners
      FROM memory_states
      HAVING COUNT(DISTINCT learner_id) >= 5
    `);

    res.json({
      ece: eceResult.rows[0]?.ece || null,
      avg_half_life: halfLifeResult.rows[0]?.avg_half_life || null
    });
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

module.exports = router;
