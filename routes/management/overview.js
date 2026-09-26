const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        (SELECT COUNT(DISTINCT id) FROM learners) AS total_learners,
        (SELECT COUNT(DISTINCT id) FROM concepts) AS total_concepts,
        (SELECT COUNT(DISTINCT id) FROM notes) AS total_notes,
        (SELECT AVG(predicted_recall) FROM attempts) AS avg_recall
      FROM learners l
      HAVING COUNT(DISTINCT l.id) >= 5
    `);
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Privacy floor not met' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
