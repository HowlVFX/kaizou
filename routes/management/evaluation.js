const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const { MIN_LEARNERS, num, ok, sendError } = require('./_shared');

const router = express.Router();

// GET /api/management/evaluation
// System-trust metrics (design §5.25) live only in portal_aggregates; they are
// never mixed into learner analytics. Only unsuppressed rows with
// sample_size >= 5 are returned (latest per metric_key + cohort_key + dimensions).
router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const [metrics, lastRun] = await Promise.all([
      db.query(`
        SELECT DISTINCT ON (metric_key, cohort_key, dimensions)
          metric_key, cohort_key, dimensions, value, sample_size, window_start, window_end, computed_at
        FROM portal_aggregates
        WHERE suppressed = false AND sample_size >= $1
        ORDER BY metric_key, cohort_key, dimensions, computed_at DESC
      `, [MIN_LEARNERS]),
      db.query(`
        SELECT MAX(completed_at) AS last_run_at
        FROM jobs
        WHERE job_type = 'EVALUATION_RUN' AND status = 'COMPLETED'
      `),
    ]);

    res.json(ok({
      last_run_at: lastRun.rows[0].last_run_at,
      metrics: metrics.rows.map((r) => ({
        metric_key: r.metric_key,
        cohort_key: r.cohort_key,
        // Enum-valued keys only (e.g. { band }, { discrimination }); no free text (D-10).
        dimensions: r.dimensions || {},
        value: num(r.value),
        sample_size: r.sample_size,
        window_start: r.window_start,
        window_end: r.window_end,
        computed_at: r.computed_at,
      })),
    }));
  } catch (err) {
    sendError(res, 'evaluation', err);
  }
});

module.exports = router;
