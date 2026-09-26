const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const health = await db.query(`
      SELECT 
        COUNT(*) as total_clusters,
        AVG(size) as avg_size,
        AVG(modularity) as avg_modularity
      FROM clusters
      HAVING COUNT(DISTINCT learner_id) >= 5
    `);

    const lineage = await db.query(`
      SELECT event_type, COUNT(*) as count
      FROM cluster_lineage
      GROUP BY event_type
      HAVING COUNT(DISTINCT learner_id) >= 5
    `);

    res.json({
      health: health.rows[0] || {},
      lineage: lineage.rows
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

module.exports = router;
