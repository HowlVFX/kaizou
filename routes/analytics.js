const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const soloLevels = await db.query(`SELECT solo_level, COUNT(*) as count FROM concepts WHERE learner_id = $1 GROUP BY solo_level`, [req.user.id]);
    const recallDist = await db.query(`SELECT half_life, COUNT(*) as count FROM memory_states WHERE learner_id = $1 GROUP BY half_life`, [req.user.id]);
    
    res.json({
      soloLevels: soloLevels.rows,
      recallDistribution: recallDist.rows,
      absorptionEfficiency: 0.85
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
