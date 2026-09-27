const express = require('express');
const db = require('../../database/db');
const managementAuth = require('../../middleware/management-auth');
const { num, meetsFloor, ok, suppressed, floorRows, sendError } = require('./_shared');

const router = express.Router();

// GET /api/management/population
router.get('/', managementAuth, async (req, res) => {
  try {
    // Cohort: learners who have produced any notes or attempts.
    const cohort = await db.query(`
      WITH contributors AS (
        SELECT learner_id FROM notes
        UNION
        SELECT learner_id FROM attempts
      ),
      active AS (
        SELECT learner_id FROM notes WHERE updated_at >= NOW() - INTERVAL '30 days'
        UNION
        SELECT learner_id FROM attempts WHERE submitted_at >= NOW() - INTERVAL '30 days'
      )
      SELECT
        (SELECT COUNT(*)::int FROM contributors) AS contributing,
        (SELECT COUNT(*)::int FROM active) AS active
    `);
    const { contributing, active } = cohort.rows[0];

    if (!meetsFloor(contributing)) {
      return res.json(suppressed('Fewer than 5 learners have contributed notes or attempts', {
        active_learners: null,
        inactive_learners: null,
        recall_distribution: [],
        solo_distribution: [],
      }));
    }

    // Latest predicted recall per (learner, concept), bucketed in steps of 0.1.
    const [recall, solo] = await Promise.all([
      db.query(`
        WITH latest AS (
          SELECT DISTINCT ON (learner_id, concept_id) learner_id, predicted_recall
          FROM attempts
          WHERE predicted_recall IS NOT NULL
          ORDER BY learner_id, concept_id, submitted_at DESC
        )
        SELECT
          LEAST(FLOOR(predicted_recall * 10), 9)::int AS bucket,
          COUNT(*)::int AS count,
          COUNT(DISTINCT learner_id)::int AS n_learners
        FROM latest
        GROUP BY 1
        ORDER BY 1
      `),
      db.query(`
        SELECT solo_level::text AS level, COUNT(*)::int AS count,
               COUNT(DISTINCT learner_id)::int AS n_learners
        FROM concepts
        WHERE solo_level IS NOT NULL
        GROUP BY solo_level
        ORDER BY solo_level
      `),
    ]);

    const recallRows = floorRows(recall.rows, (r) => ({
      bucket: `${(r.bucket / 10).toFixed(1)}-${((r.bucket + 1) / 10).toFixed(1)}`,
      count: num(r.count),
    }));
    const soloRows = floorRows(solo.rows, (r) => ({ level: r.level, count: num(r.count) }));

    res.json(ok({
      active_learners: active,
      inactive_learners: contributing - active,
      recall_distribution: recallRows.rows,
      solo_distribution: soloRows.rows,
      suppressed_groups: recallRows.suppressed_groups + soloRows.suppressed_groups,
    }));
  } catch (err) {
    sendError(res, 'population', err);
  }
});

module.exports = router;
