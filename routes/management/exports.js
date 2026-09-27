const express = require('express');
const db = require('../../database/db');
const managementAuth = require('../../middleware/management-auth');
const { MIN_LEARNERS, num, meetsFloor, suppressed, sendError } = require('./_shared');

const router = express.Router();

// Each report returns flat rows with no free text and no learner identifiers (D-10).
const REPORTS = {
  // Latest unsuppressed system/portal aggregate per metric_key + cohort_key + dimensions.
  'anonymised-metrics': async () => {
    const result = await db.query(`
      SELECT DISTINCT ON (metric_key, cohort_key, dimensions)
        metric_key, cohort_key, dimensions, value, sample_size, window_start, window_end, computed_at
      FROM portal_aggregates
      WHERE suppressed = false AND sample_size >= $1
      ORDER BY metric_key, cohort_key, dimensions, computed_at DESC
    `, [MIN_LEARNERS]);
    return {
      rows: result.rows.map((r) => ({
        metric_key: r.metric_key,
        cohort_key: r.cohort_key,
        dimensions: JSON.stringify(r.dimensions || {}),
        value: num(r.value),
        sample_size: r.sample_size,
        window_start: r.window_start ? r.window_start.toISOString() : null,
        window_end: r.window_end ? r.window_end.toISOString() : null,
        computed_at: r.computed_at ? r.computed_at.toISOString() : null,
      })),
    };
  },

  // Per-learner activity rows, only for learners who opted in (D-09), with no
  // id/email/name and in random order so rows cannot be joined back.
  'learner-data': async () => {
    const result = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM notes n WHERE n.learner_id = l.id)::int AS notes,
        (SELECT COUNT(*) FROM concepts c WHERE c.learner_id = l.id)::int AS concepts,
        a.attempts, a.pass_rate, a.avg_composite,
        (SELECT COUNT(mastered_at) FROM memory_states m WHERE m.learner_id = l.id)::int AS mastered_concepts
      FROM learners l
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS attempts,
               AVG(passed::int)::float8 AS pass_rate,
               AVG(composite_score)::float8 AS avg_composite
        FROM attempts WHERE learner_id = l.id
      ) a ON true
      WHERE l.portal_optin = true
      ORDER BY random()
    `);
    if (!meetsFloor(result.rows.length)) {
      return { suppressed: 'Fewer than 5 learners have opted in to portal data sharing' };
    }
    return {
      rows: result.rows.map((r) => ({
        notes: r.notes,
        concepts: r.concepts,
        attempts: r.attempts,
        pass_rate: num(r.pass_rate),
        avg_composite: num(r.avg_composite),
        mastered_concepts: r.mastered_concepts,
      })),
    };
  },
};

function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let s = String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

// GET /api/management/exports/:reportType?format=json|csv
// Suppressed reports return 200 JSON { suppressed: true, ... } without an attachment.
router.get('/:reportType', managementAuth, async (req, res) => {
  const { reportType } = req.params;
  const build = Object.prototype.hasOwnProperty.call(REPORTS, reportType) ? REPORTS[reportType] : null;
  if (!build) {
    return res.status(404).json({ error: 'Report type not found' });
  }
  const format = req.query.format === 'csv' ? 'csv' : 'json';

  try {
    const report = await build();
    if (report.suppressed) {
      return res.json(suppressed(report.suppressed, { report: reportType, rows: [] }));
    }

    const generatedAt = new Date().toISOString();
    const filename = `kaizou-${reportType}-${generatedAt.slice(0, 10)}.${format}`;
    res.set('Content-Disposition', `attachment; filename="${filename}"`);

    if (format === 'csv') {
      res.type('text/csv').send(toCsv(report.rows));
    } else {
      res.json({
        report: reportType,
        generated_at: generatedAt,
        suppressed: false,
        min_learners: MIN_LEARNERS,
        rows: report.rows,
      });
    }
  } catch (err) {
    sendError(res, 'exports', err);
  }
});

module.exports = router;
