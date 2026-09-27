const express = require('express');
const db = require('../../database/db');
const managementAuth = require('../../middleware/management-auth');
const { meetsFloor, ok, suppressed, gated, sendError } = require('./_shared');

const router = express.Router();

// GET /api/management/overview
// Always returns 200. Below the privacy floor it returns
// { suppressed: true, reason, min_learners, total_learners, jobs } only.
router.get('/', managementAuth, async (req, res) => {
  try {
    // Non-learner-derived totals: safe to show regardless of the floor.
    const [learners, jobs, cohort] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS total FROM learners`),
      db.query(`SELECT status::text AS status, COUNT(*)::int AS count FROM jobs GROUP BY status`),
      db.query(`SELECT COUNT(DISTINCT learner_id)::int AS n FROM notes`),
    ]);

    const jobCounts = { PENDING: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 };
    for (const row of jobs.rows) jobCounts[row.status] = row.count;

    const base = { total_learners: learners.rows[0].total, jobs: jobCounts };
    const contributing = cohort.rows[0].n;

    if (!meetsFloor(contributing)) {
      return res.json(suppressed('Fewer than 5 learners have created notes', base));
    }

    const [knowledge, attempts, memory] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*)::int FROM notes) AS total_notes,
          COUNT(*)::int AS total_concepts,
          COUNT(*) FILTER (WHERE status = 'VERIFIED_CONCEPT')::int AS verified_concepts,
          COUNT(DISTINCT learner_id)::int AS n_learners
        FROM concepts
      `),
      db.query(`
        SELECT
          COUNT(*)::int AS total_attempts,
          AVG(passed::int)::float8 AS pass_rate,
          AVG(predicted_recall)::float8 AS avg_recall,
          COUNT(DISTINCT learner_id)::int AS n_learners
        FROM attempts
      `),
      db.query(`
        SELECT
          (COUNT(mastered_at)::float8 / NULLIF(COUNT(*), 0)) AS mastery_rate,
          COUNT(DISTINCT learner_id)::int AS n_learners
        FROM memory_states
      `),
    ]);

    const k = knowledge.rows[0];
    const a = attempts.rows[0];
    const m = memory.rows[0];

    res.json(ok({
      ...base,
      contributing_learners: contributing,
      total_notes: k.total_notes,
      total_concepts: gated(k.total_concepts, k.n_learners),
      verified_concepts: gated(k.verified_concepts, k.n_learners),
      total_attempts: gated(a.total_attempts, a.n_learners),
      pass_rate: gated(a.pass_rate, a.n_learners),
      avg_recall: gated(a.avg_recall, a.n_learners),
      mastery_rate: gated(m.mastery_rate, m.n_learners),
    }));
  } catch (err) {
    sendError(res, 'overview', err);
  }
});

module.exports = router;
