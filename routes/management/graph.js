const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const edgeTypes = await db.query(`
      SELECT edge_type, COUNT(*) as count
      FROM edges
      GROUP BY edge_type
      HAVING COUNT(DISTINCT learner_id) >= 5
    `);
    
    const modularity = await db.query(`
      SELECT AVG(modularity) as avg_modularity
      FROM clusters
      HAVING COUNT(DISTINCT learner_id) >= 5
    `);

    res.json({
      edge_types: edgeTypes.rows,
      modularity: modularity.rows[0]?.avg_modularity || null
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

module.exports = router;
