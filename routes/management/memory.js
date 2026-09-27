const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const { num, meetsFloor, ok, suppressed, floorRows, sendError } = require('./_shared');

const router = express.Router();

// Review threshold for predicted recall (design §5.17).
const REVIEW_THRESHOLD = 0.6;

// GET /api/management/memory
router.get('/', verifyToken, managementAuth, async (req, res) => {
  try {
    const summary = await db.query(`
      SELECT
        COUNT(*)::int AS tracked_states,
        AVG(half_life)::float8 AS avg_half_life,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY half_life)::float8 AS median_half_life,
        (COUNT(mastered_at)::float8 / NULLIF(COUNT(*), 0)) AS mastery_rate,
        AVG(decay_exempt::int)::float8 AS decay_exempt_rate,
        COUNT(DISTINCT learner_id)::int AS n_learners
      FROM memory_states
    `);
    const s = summary.rows[0];

    if (!meetsFloor(s.n_learners)) {
      return res.json(suppressed('Fewer than 5 learners have memory states', {
        tracked_states: null,
        avg_half_life: null,
        median_half_life: null,
        mastery_rate: null,
        decay_exempt_rate: null,
        due_for_review_rate: null,
        half_life_distribution: [],
        recall_by_shape: [],
        calibration: null,
      }));
    }

    const [halfLife, due, byShape, calibration] = await Promise.all([
      db.query(`
        SELECT
          CASE
            WHEN half_life < 1 THEN 0
            WHEN half_life < 3 THEN 1
            WHEN half_life < 7 THEN 2
            WHEN half_life < 30 THEN 3
            ELSE 4
          END AS bucket,
          COUNT(*)::int AS count,
          COUNT(DISTINCT learner_id)::int AS n_learners
        FROM memory_states
        GROUP BY 1
        ORDER BY 1
      `),
      // Share of (learner, concept) pairs whose latest predicted recall is below threshold.
      db.query(`
        WITH latest AS (
          SELECT DISTINCT ON (learner_id, concept_id) learner_id, predicted_recall
          FROM attempts
          WHERE predicted_recall IS NOT NULL
          ORDER BY learner_id, concept_id, submitted_at DESC
        )
        SELECT AVG((predicted_recall < $1)::int)::float8 AS rate,
               COUNT(DISTINCT learner_id)::int AS n_learners
        FROM latest
      `, [REVIEW_THRESHOLD]),
      db.query(`
        SELECT c.shape::text AS shape,
               AVG(a.predicted_recall)::float8 AS avg_recall,
               COUNT(*)::int AS attempts,
               COUNT(DISTINCT a.learner_id)::int AS n_learners
        FROM attempts a
        JOIN concepts c ON c.id = a.concept_id
        WHERE a.predicted_recall IS NOT NULL
        GROUP BY c.shape
        ORDER BY c.shape
      `),
      // Calibration of predicted recall against the observed pass outcome:
      // Brier, ECE (10 equal-width bins) and AUC (Mann-Whitney via average ranks).
      db.query(`
        WITH a AS (
          SELECT learner_id, predicted_recall::float8 AS p, passed::int AS y
          FROM attempts
          WHERE predicted_recall IS NOT NULL
        ),
        bins AS (
          SELECT LEAST(FLOOR(p * 10), 9) AS b, COUNT(*) AS n, AVG(y) AS acc, AVG(p) AS conf
          FROM a GROUP BY 1
        ),
        ranked AS (
          SELECT y,
                 RANK() OVER (ORDER BY p) + (COUNT(*) OVER (PARTITION BY p) - 1) / 2.0 AS r
          FROM a
        ),
        auc AS (
          SELECT SUM(y) AS n_pos, SUM(1 - y) AS n_neg, SUM(r) FILTER (WHERE y = 1) AS rank_sum
          FROM ranked
        )
        SELECT
          (SELECT COUNT(*)::int FROM a) AS sample_size,
          (SELECT COUNT(DISTINCT learner_id)::int FROM a) AS n_learners,
          (SELECT AVG((p - y) ^ 2)::float8 FROM a) AS brier_score,
          (SELECT (SUM(n * ABS(acc - conf)) / NULLIF(SUM(n), 0))::float8 FROM bins) AS ece,
          (SELECT CASE WHEN n_pos > 0 AND n_neg > 0
                       THEN ((rank_sum - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg))::float8
                  END FROM auc) AS auc
      `),
    ]);

    const HALF_LIFE_LABELS = ['<1 day', '1-3 days', '3-7 days', '7-30 days', '30+ days'];
    const halfLifeRows = floorRows(halfLife.rows, (r) => ({
      bucket: HALF_LIFE_LABELS[r.bucket],
      count: num(r.count),
    }));
    const shapeRows = floorRows(byShape.rows, (r) => ({
      shape: r.shape,
      avg_recall: num(r.avg_recall),
      attempts: num(r.attempts),
    }));
    const d = due.rows[0];
    const c = calibration.rows[0];

    res.json(ok({
      tracked_states: s.tracked_states,
      avg_half_life: num(s.avg_half_life),
      median_half_life: num(s.median_half_life),
      mastery_rate: num(s.mastery_rate),
      decay_exempt_rate: num(s.decay_exempt_rate),
      review_threshold: REVIEW_THRESHOLD,
      due_for_review_rate: meetsFloor(d.n_learners) ? num(d.rate) : null,
      half_life_distribution: halfLifeRows.rows,
      recall_by_shape: shapeRows.rows,
      suppressed_groups: halfLifeRows.suppressed_groups + shapeRows.suppressed_groups,
      calibration: meetsFloor(c.n_learners)
        ? { brier_score: num(c.brier_score), ece: num(c.ece), auc: num(c.auc), sample_size: c.sample_size }
        : null,
    }));
  } catch (err) {
    sendError(res, 'memory', err);
  }
});

module.exports = router;
