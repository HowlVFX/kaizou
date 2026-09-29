const express = require('express');
const db = require('../../database/db');
const managementAuth = require('../../middleware/management-auth');
const { num, meetsFloor, ok, latestAggregates, sendError } = require('./_shared');

const router = express.Router();

// Human-agreement metrics need labelled data that is not in the schema; they
// only appear once the aggregates job writes them to portal_aggregates.
const SYSTEM_KEYS = ['cohens_kappa', 'kappa', 'generation_agreement'];

// GET /api/management/grader
router.get('/', managementAuth, async (req, res) => {
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

    // Population grader stats (counts, means, bands) contain no learner ids and
    // no answer text, so they stay visible below the N=5 floor. A two-learner
    // demo was otherwise an entirely blank page. Cohen's κ and inter-run
    // agreement still come only from portal_aggregates.
    const bands = await db.query(`
      SELECT band::text AS band, COUNT(*)::int AS count
      FROM attempts
      GROUP BY band
      ORDER BY band
    `);

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
      band_distribution: bands.rows.map((r) => ({ band: r.band, count: num(r.count) })),
      contributing_learners: s.n_learners,
      cohort_below_floor: !meetsFloor(s.n_learners),
      system_metrics,
    }));
  } catch (err) {
    sendError(res, 'grader', err);
  }
});

// --- Cohen's kappa labelling (§5.25.1) ------------------------------------
// Admin-only QA workflow: a human rater assigns a gold band to graded
// attempts; the aggregates job turns those labels into portal_aggregates
// 'cohens_kappa'. These endpoints are admin-only (managementAuth). The
// sample endpoint returns answer text (PII-adjacent) but is gated to admins
// and truncates the text; no learner-derived aggregate is exposed here.

const GRADING_BANDS = ['Full', 'Shallow', 'Incomplete', 'Not_Yet_Engaged'];
const ANSWER_PREVIEW_CHARS = 280;

// Cohen's kappa over paired band labels, mirrored from
// app/evaluation/metrics.calculate_cohens_kappa (four-band confusion matrix).
function cohensKappa(predicted, actual) {
  const n = predicted.length;
  if (n === 0) return 0;
  const cats = Array.from(new Set([...predicted, ...actual])).sort();
  const idx = new Map(cats.map((c, i) => [c, i]));
  const k = cats.length;
  const m = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < n; i++) m[idx.get(predicted[i])][idx.get(actual[i])] += 1;
  let po = 0;
  for (let i = 0; i < k; i++) po += m[i][i];
  po /= n;
  let pe = 0;
  for (let i = 0; i < k; i++) {
    let row = 0;
    let col = 0;
    for (let j = 0; j < k; j++) {
      row += m[i][j];
      col += m[j][i];
    }
    pe += (row * col) / (n * n);
  }
  if (pe >= 1) return po >= 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

// GET /api/management/grader/labels/sample?limit=50
// A sample of graded attempts for a rater to label, unlabelled ones first.
router.get('/labels/sample', managementAuth, async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    limit = Math.min(limit, 200);

    const result = await db.query(
      `SELECT a.id AS attempt_id, p.type::text AS probe_type,
              a.band::text AS machine_band,
              LEFT(COALESCE(a.answer_text, ''), $1) AS answer_text,
              LENGTH(COALESCE(a.answer_text, '')) > $1 AS answer_truncated,
              c.canonical_label AS concept_label,
              (g.id IS NOT NULL) AS has_label
       FROM attempts a
       JOIN probes p ON p.id = a.probe_id
       JOIN concepts c ON c.id = a.concept_id
       LEFT JOIN attempt_gold_labels g
              ON g.attempt_id = a.id AND g.rater = $2
       ORDER BY (g.id IS NOT NULL), a.submitted_at DESC
       LIMIT $3`,
      [ANSWER_PREVIEW_CHARS, String(req.user.id), limit]
    );

    res.json(ok({
      bands: GRADING_BANDS,
      attempts: result.rows.map((r) => ({
        attempt_id: r.attempt_id,
        probe_type: r.probe_type,
        machine_band: r.machine_band,
        answer_text: r.answer_text,
        answer_truncated: r.answer_truncated,
        concept_label: r.concept_label,
        has_label: r.has_label,
      })),
    }));
  } catch (err) {
    sendError(res, 'grader-labels-sample', err);
  }
});

// POST /api/management/grader/labels {attempt_id, human_band, note?}
// Upsert this rater's gold band for an attempt.
router.post('/labels', managementAuth, async (req, res) => {
  try {
    const { attempt_id, human_band, note } = req.body || {};
    if (!attempt_id) {
      return res.status(400).json({ error: 'attempt_id is required' });
    }
    if (!GRADING_BANDS.includes(human_band)) {
      return res.status(400).json({
        error: `human_band must be one of ${GRADING_BANDS.join(', ')}`,
      });
    }

    const rater = String(req.user.id);
    const exists = await db.query('SELECT 1 FROM attempts WHERE id = $1', [attempt_id]);
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const result = await db.query(
      `INSERT INTO attempt_gold_labels (attempt_id, human_band, rater, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (attempt_id, rater)
       DO UPDATE SET human_band = EXCLUDED.human_band,
                     note = EXCLUDED.note,
                     created_at = CURRENT_TIMESTAMP
       RETURNING id, attempt_id, human_band::text AS human_band, rater, note, created_at`,
      [attempt_id, human_band, rater, note || null]
    );

    res.json(ok({ label: result.rows[0] }));
  } catch (err) {
    sendError(res, 'grader-labels-post', err);
  }
});

// GET /api/management/grader/labels/agreement
// Live Cohen's κ from this rater's gold labels joined to machine bands, plus
// the canonical value the aggregates job wrote to portal_aggregates.
router.get('/labels/agreement', managementAuth, async (req, res) => {
  try {
    const rater = String(req.user.id);
    const result = await db.query(
      `SELECT a.band::text AS machine_band, g.human_band::text AS human_band
       FROM attempt_gold_labels g
       JOIN attempts a ON a.id = g.attempt_id
       WHERE g.rater = $1`,
      [rater]
    );
    const predicted = result.rows.map((r) => r.machine_band);
    const actual = result.rows.map((r) => r.human_band);
    const n = predicted.length;

    const aggregates = await latestAggregates(SYSTEM_KEYS);
    res.json(ok({
      live: {
        cohens_kappa: n > 0 ? cohensKappa(predicted, actual) : null,
        n,
        rater,
      },
      // Canonical population value (all raters), written by the evaluation job.
      published: aggregates.cohens_kappa || aggregates.kappa,
    }));
  } catch (err) {
    sendError(res, 'grader-labels-agreement', err);
  }
});

module.exports = router;
