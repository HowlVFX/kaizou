const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

router.get('/', verifyToken, async (req, res) => {
  try {
    const conceptsResult = await db.query('SELECT * FROM concepts WHERE learner_id = $1', [req.user.id]);
    const edgesResult = await db.query('SELECT * FROM edges WHERE learner_id = $1', [req.user.id]);
    res.json({ nodes: conceptsResult.rows, edges: edgesResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/edges', verifyToken, async (req, res) => {
  try {
    const edgesResult = await db.query('SELECT * FROM edges WHERE learner_id = $1', [req.user.id]);
    res.json(edgesResult.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/neighbors/:conceptId', verifyToken, async (req, res) => {
  try {
    const edgesResult = await db.query('SELECT * FROM edges WHERE (source_id = $1 OR target_id = $1) AND learner_id = $2', [req.params.conceptId, req.user.id]);
    res.json(edgesResult.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
