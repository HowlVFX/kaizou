const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const { num, meetsFloor, ok, suppressed, floorRows, gated, sendError } = require('./_shared');

const router = express.Router();

// GET /api/management/graph
router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const summary = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM concepts) AS total_nodes,
        (SELECT COUNT(*)::int FROM edges) AS total_edges,
        (SELECT COUNT(*)::int FROM concepts c
          WHERE NOT EXISTS (SELECT 1 FROM edges e WHERE e.source_id = c.id OR e.target_id = c.id)
        ) AS isolated_nodes,
        (SELECT COUNT(DISTINCT learner_id)::int FROM concepts) AS n_learners
    `);
    const s = summary.rows[0];

    if (!meetsFloor(s.n_learners)) {
      return res.json(suppressed('Fewer than 5 learners have concepts', {
        total_nodes: null,
        total_edges: null,
        avg_degree: null,
        isolated_node_rate: null,
        avg_modularity: null,
        edge_type_distribution: [],
        flag_distribution: [],
      }));
    }

    const [types, flags, modularity] = await Promise.all([
      db.query(`
        SELECT type::text AS type, COUNT(*)::int AS count,
               AVG(weight)::float8 AS avg_weight,
               COUNT(DISTINCT learner_id)::int AS n_learners
        FROM edges
        GROUP BY type
        ORDER BY type
      `),
      db.query(`
        SELECT flag::text AS flag, COUNT(*)::int AS count,
               COUNT(DISTINCT learner_id)::int AS n_learners
        FROM edges
        WHERE flag IS NOT NULL
        GROUP BY flag
        ORDER BY flag
      `),
      db.query(`
        SELECT AVG(modularity)::float8 AS avg_modularity,
               COUNT(DISTINCT learner_id)::int AS n_learners
        FROM clusters
        WHERE status = 'ACTIVE' AND modularity IS NOT NULL
      `),
    ]);

    const typeRows = floorRows(types.rows, (r) => ({
      type: r.type,
      count: num(r.count),
      avg_weight: num(r.avg_weight),
    }));
    const flagRows = floorRows(flags.rows, (r) => ({ flag: r.flag, count: num(r.count) }));
    const m = modularity.rows[0];

    res.json(ok({
      total_nodes: s.total_nodes,
      total_edges: s.total_edges,
      // Undirected average degree: each edge touches two nodes.
      avg_degree: s.total_nodes > 0 ? (2 * s.total_edges) / s.total_nodes : null,
      isolated_node_rate: s.total_nodes > 0 ? s.isolated_nodes / s.total_nodes : null,
      avg_modularity: gated(m.avg_modularity, m.n_learners),
      edge_type_distribution: typeRows.rows,
      flag_distribution: flagRows.rows,
      suppressed_groups: typeRows.suppressed_groups + flagRows.suppressed_groups,
    }));
  } catch (err) {
    sendError(res, 'graph', err);
  }
});

module.exports = router;
