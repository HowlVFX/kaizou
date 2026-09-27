const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLUSTER_COLS = 'id, parent_cluster_id, label, modularity, member_count, resolution, status, created_at, last_named_at';

// List: ACTIVE clusters only (ARCHIVED ones are kept for lineage history),
// each with member_ids so the client doesn't need one request per cluster.
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ${CLUSTER_COLS.split(', ').map((c) => `cl.${c}`).join(', ')},
              COALESCE(
                (SELECT array_agg(cm.concept_id::text ORDER BY cm.concept_id)
                   FROM cluster_members cm
                   JOIN concepts c ON c.id = cm.concept_id AND c.learner_id = cl.learner_id
                  WHERE cm.cluster_id = cl.id),
                '{}'::text[]) AS member_ids
       FROM clusters cl
       WHERE cl.learner_id = $1 AND cl.status = 'ACTIVE'`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching clusters:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Cluster not found' });
    const clusterResult = await db.query(
      `SELECT ${CLUSTER_COLS} FROM clusters WHERE id = $1 AND learner_id = $2`,
      [req.params.id, req.user.id]
    );
    if (clusterResult.rows.length === 0) return res.status(404).json({ error: 'Cluster not found' });

    // Members are joined to concepts and scoped to the learner as well.
    const membersResult = await db.query(
      `SELECT cm.cluster_id, cm.concept_id, cm.computed_at, c.canonical_label
       FROM cluster_members cm
       JOIN concepts c ON c.id = cm.concept_id AND c.learner_id = $2
       WHERE cm.cluster_id = $1`,
      [req.params.id, req.user.id]
    );
    const cluster = clusterResult.rows[0];
    cluster.members = membersResult.rows;
    res.json(cluster);
  } catch (err) {
    console.error('Error fetching cluster:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
