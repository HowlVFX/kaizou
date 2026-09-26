const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM clusters WHERE learner_id = $1', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const clusterResult = await db.query('SELECT * FROM clusters WHERE id = $1 AND learner_id = $2', [req.params.id, req.user.id]);
    if (clusterResult.rows.length === 0) return res.status(404).json({ error: 'Cluster not found' });
    
    const membersResult = await db.query('SELECT * FROM cluster_members WHERE cluster_id = $1', [req.params.id]);
    const cluster = clusterResult.rows[0];
    cluster.members = membersResult.rows;
    res.json(cluster);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
