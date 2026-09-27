const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const { num, meetsFloor, ok, suppressed, floorRows, latestAggregates, sendError } = require('./_shared');

const router = express.Router();

// Human-agreement metrics need labelled data that is not in the schema; they
// only appear once the aggregates job writes them to portal_aggregates.
const SYSTEM_KEYS = ['cohens_kappa', 'kappa', 'generation_agreement'];

// GET /api/management/grader
router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const aggregates = await latestAggregates(SYSTEM_KEYS);
    const system_metrics = {
      cohens_kappa: aggregates.cohens_kappa || aggregates.kappa,
      inter_run_agreement: aggregates.generation_agreement,
    };

    const summary = await db.query(`
      SELECT
        COUNT(*)::int AS total_attempts,
        AVG(passed::int)::float8 AS pass_rate,
        AVG(composite_score)::float8 AS composite,
        AVG(coverage)::float8 AS coverage,
        AVG(ordering)::float8 AS ordering,
        AVG(precision_score)::float8 AS precision_avg,
        AVG(verbatim)::float8 AS verbatim,
        COUNT(DISTINCT learner_id)::int AS n_learners
      FROM attempts
    `);
    const s = summary.rows[0];

    if (!meetsFloor(s.n_learners)) {
      return res.json(suppressed('Fewer than 5 learners have submitted attempts', {
        total_attempts: null,
        pass_rate: null,
        avg_scores: null,
        band_distribution: [],
        system_metrics,
      }));
    }

    const bands = await db.query(`
      SELECT band::text AS band, COUNT(*)::int AS count,
             COUNT(DISTINCT learner_id)::int AS n_learners
      FROM attempts
      GROUP BY band
      ORDER BY band
    `);
    const bandRows = floorRows(bands.rows, (r) => ({ band: r.band, count: num(r.count) }));

    res.json(ok({
      total_attempts: s.total_attempts,
      pass_rate: num(s.pass_rate),
      avg_scores: {
        composite: num(s.composite),
        coverage: num(s.coverage),
        ordering: num(s.ordering),
        precision: num(s.precision_avg),
        verbatim: num(s.verbatim),
      },
      band_distribution: bandRows.rows,
      suppressed_groups: bandRows.suppressed_groups,
      system_metrics,
    }));
  } catch (err) {
    sendError(res, 'grader', err);
  }
});

module.exports = router;
