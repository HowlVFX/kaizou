const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const { num, meetsFloor, ok, suppressed, floorRows, sendError } = require('./_shared');

const router = express.Router();

// GET /api/management/clusters
router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    // Size comes from cluster_members (clusters.member_count is a cached copy).
    const health = await db.query(`
      WITH sizes AS (
        SELECT cl.id, cl.learner_id, cl.status, cl.modularity, COUNT(cm.concept_id) AS size
        FROM clusters cl
        LEFT JOIN cluster_members cm ON cm.cluster_id = cl.id
        GROUP BY cl.id
      )
      SELECT
        COUNT(*)::int AS total_clusters,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_clusters,
        AVG(size) FILTER (WHERE status = 'ACTIVE')::float8 AS avg_cluster_size,
        AVG(modularity) FILTER (WHERE status = 'ACTIVE')::float8 AS avg_modularity,
        COUNT(DISTINCT learner_id)::int AS n_learners
      FROM sizes
    `);
    const h = health.rows[0];

    if (!meetsFloor(h.n_learners)) {
      return res.json(suppressed('Fewer than 5 learners have clusters', {
        total_clusters: null,
        active_clusters: null,
        avg_cluster_size: null,
        avg_modularity: null,
        lineage_events: [],
      }));
    }

    const lineage = await db.query(`
      SELECT event::text AS event, COUNT(*)::int AS count,
             AVG(jaccard)::float8 AS avg_jaccard,
             COUNT(DISTINCT learner_id)::int AS n_learners
      FROM cluster_lineage
      GROUP BY event
      ORDER BY event
    `);
    const lineageRows = floorRows(lineage.rows, (r) => ({
      event: r.event,
      count: num(r.count),
      avg_jaccard: num(r.avg_jaccard),
    }));

    res.json(ok({
      total_clusters: h.total_clusters,
      active_clusters: h.active_clusters,
      avg_cluster_size: num(h.avg_cluster_size),
      avg_modularity: num(h.avg_modularity),
      lineage_events: lineageRows.rows,
      suppressed_groups: lineageRows.suppressed_groups,
    }));
  } catch (err) {
    sendError(res, 'clusters', err);
  }
});

module.exports = router;
