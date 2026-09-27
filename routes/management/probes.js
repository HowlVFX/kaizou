const express = require('express');
const db = require('../../database/db');
const managementAuth = require('../../middleware/management-auth');
const { MIN_LEARNERS, num, meetsFloor, ok, suppressed, floorRows, sendError } = require('./_shared');

const router = express.Router();

// Discrimination bands for point-biserial r_pb (design §5.16, mirrors
// fastapi/app/evaluation/metrics.py classify_probe_discrimination).
const BAND_SQL = `
  CASE
    WHEN r_pb >= 0.30 THEN 'acceptable'
    WHEN r_pb >= 0.15 THEN 'weak'
    WHEN r_pb >= 0 THEN 'retire'
    ELSE 'inverted_defect'
  END`;

// GET /api/management/probes
router.get('/', managementAuth, async (req, res) => {
  try {
    // Probes are owned through their concept's learner.
    const summary = await db.query(`
      SELECT
        COUNT(*)::int AS total_probes,
        AVG(p.leaked::int)::float8 AS leakage_rate,
        AVG(p.retries)::float8 AS avg_retries,
        COUNT(DISTINCT c.learner_id)::int AS n_learners
      FROM probes p
      JOIN concepts c ON c.id = p.concept_id
    `);
    const s = summary.rows[0];

    if (!meetsFloor(s.n_learners)) {
      return res.json(suppressed('Fewer than 5 learners have probes', {
        total_probes: null,
        leakage_rate: null,
        avg_retries: null,
        probe_type_distribution: [],
        discrimination: null,
      }));
    }

    const [types, discrimination] = await Promise.all([
      db.query(`
        SELECT p.type::text AS type,
               COUNT(DISTINCT p.id)::int AS probes,
               COUNT(a.id)::int AS attempts,
               AVG(a.passed::int)::float8 AS pass_rate,
               AVG(a.composite_score)::float8 AS avg_score,
               COUNT(DISTINCT c.learner_id)::int AS n_learners
        FROM probes p
        JOIN concepts c ON c.id = p.concept_id
        LEFT JOIN attempts a ON a.probe_id = p.id
        GROUP BY p.type
        ORDER BY p.type
      `),
      // r_pb per probe = corr(learner's latest outcome on this probe, that
      // learner's mean composite on OTHER concepts); Pearson r on a binary
      // variable is the point-biserial. Same definition as
      // fastapi/app/evaluation/aggregates.py. Only probes with >= 5 learners.
      db.query(`
        WITH latest AS (
          SELECT DISTINCT ON (probe_id, learner_id) probe_id, learner_id, concept_id, passed
          FROM attempts
          ORDER BY probe_id, learner_id, submitted_at DESC
        ),
        x AS (
          SELECT l.probe_id, l.passed::int::float8 AS y,
                 (SELECT AVG(o.composite_score) FROM attempts o
                   WHERE o.learner_id = l.learner_id AND o.concept_id <> l.concept_id)::float8 AS other
          FROM latest l
        ),
        per_probe AS (
          SELECT probe_id, COALESCE(corr(y, other), 0)::float8 AS r_pb
          FROM x
          WHERE other IS NOT NULL
          GROUP BY probe_id
          HAVING COUNT(*) >= $1
        )
        SELECT ${BAND_SQL} AS band, COUNT(*)::int AS count, AVG(r_pb)::float8 AS avg_r_pb
        FROM per_probe
        GROUP BY 1
      `, [MIN_LEARNERS]),
    ]);

    const typeRows = floorRows(types.rows, (r) => ({
      type: r.type,
      probes: num(r.probes),
      attempts: num(r.attempts),
      pass_rate: num(r.pass_rate),
      avg_score: num(r.avg_score),
    }));

    const bandOrder = ['acceptable', 'weak', 'retire', 'inverted_defect'];
    const bandCounts = Object.fromEntries(bandOrder.map((b) => [b, 0]));
    let evaluated = 0;
    let weightedSum = 0;
    for (const r of discrimination.rows) {
      bandCounts[r.band] = r.count;
      evaluated += r.count;
      weightedSum += r.count * num(r.avg_r_pb);
    }

    res.json(ok({
      total_probes: s.total_probes,
      leakage_rate: num(s.leakage_rate),
      avg_retries: num(s.avg_retries),
      probe_type_distribution: typeRows.rows,
      suppressed_groups: typeRows.suppressed_groups,
      discrimination: {
        evaluated_probes: evaluated,
        avg_r_pb: evaluated > 0 ? weightedSum / evaluated : null,
        bands: bandOrder.map((band) => ({ band, count: bandCounts[band] })),
      },
    }));
  } catch (err) {
    sendError(res, 'probes', err);
  }
});

module.exports = router;
