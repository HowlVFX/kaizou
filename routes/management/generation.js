const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const { num, meetsFloor, ok, suppressed, floorRows, latestAggregates, sendError } = require('./_shared');

const router = express.Router();

// Run-to-run agreement / leakage rejection are not derivable from stored rows;
// they appear only when written to portal_aggregates.
const SYSTEM_KEYS = ['generation_agreement', 'leakage_rejection_rate', 'retry_rate'];

// GET /api/management/generation
router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const system_metrics = await latestAggregates(SYSTEM_KEYS);

    // Claims reach a learner through their concept.
    const claims = await db.query(`
      SELECT
        COUNT(cl.id)::int AS total_claims,
        (COUNT(cl.id)::float8 / NULLIF(COUNT(DISTINCT cl.concept_id), 0)) AS avg_claims_per_concept,
        AVG(cl.is_load_bearing::int)::float8 AS load_bearing_rate,
        AVG(cl.is_transition::int)::float8 AS transition_rate,
        COUNT(DISTINCT c.learner_id)::int AS n_learners
      FROM claims cl
      -- Each concept version holds its full claim set, so count the current version only.
      JOIN concepts c ON c.id = cl.concept_id AND cl.concept_version = c.version
    `);
    const cl = claims.rows[0];

    if (!meetsFloor(cl.n_learners)) {
      return res.json(suppressed('Fewer than 5 learners have generated claims', {
        total_claims: null,
        avg_claims_per_concept: null,
        load_bearing_rate: null,
        transition_rate: null,
        templates: null,
        system_metrics,
      }));
    }

    const [templates, tiers] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS total,
          AVG((pt.confidence = 'stable')::int)::float8 AS stable_rate,
          AVG(pt.order_tau)::float8 AS avg_order_tau,
          AVG(pt.disputed_count)::float8 AS avg_disputed_count,
          COUNT(DISTINCT c.learner_id)::int AS n_learners
        FROM process_templates pt
        JOIN concepts c ON c.id = pt.concept_id
      `),
      db.query(`
        SELECT pt.tier::text AS tier, COUNT(*)::int AS count,
               COUNT(DISTINCT c.learner_id)::int AS n_learners
        FROM process_templates pt
        JOIN concepts c ON c.id = pt.concept_id
        GROUP BY pt.tier
        ORDER BY pt.tier
      `),
    ]);

    const t = templates.rows[0];
    const tierRows = floorRows(tiers.rows, (r) => ({ tier: r.tier, count: num(r.count) }));

    res.json(ok({
      total_claims: cl.total_claims,
      avg_claims_per_concept: num(cl.avg_claims_per_concept),
      load_bearing_rate: num(cl.load_bearing_rate),
      transition_rate: num(cl.transition_rate),
      templates: meetsFloor(t.n_learners)
        ? {
            total: t.total,
            stable_rate: num(t.stable_rate),
            avg_order_tau: num(t.avg_order_tau),
            avg_disputed_count: num(t.avg_disputed_count),
            tier_distribution: tierRows.rows,
          }
        : null,
      suppressed_groups: tierRows.suppressed_groups,
      system_metrics,
    }));
  } catch (err) {
    sendError(res, 'generation', err);
  }
});

module.exports = router;
