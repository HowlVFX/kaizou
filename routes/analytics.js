const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const { soloToUi } = require('../services/solo');
const { computeRecall, RECALL_STRONG, RECALL_FADING } = require('../services/recall');
const router = express.Router();

// GET /api/analytics/dashboard
// {
//   soloLevels:         [{ solo_level, count }]          (UI SOLO spelling)
//   recallDistribution: [{ band, count }]  band in strong (R >= 0.75),
//                       fading (0.5 <= R < 0.75), weak (R < 0.5),
//                       unreviewed (no review yet)  -- same bands as the graph colours
//   absorptionEfficiency: number in [0,1] | null
//   absorption: { absorbed, ingested }
// }
//
// absorptionEfficiency = absorbed / ingested, where
//   ingested = the learner's concepts linked to at least one of their notes
//              (note_concepts), i.e. concepts actually extracted by ingestion;
//   absorbed = ingested concepts that are mastered (mastered_at set or
//              decay_exempt) or whose current recall R >= 0.75.
// null when nothing has been ingested yet (no data, not 0%).
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const soloLevels = await db.query(
      `SELECT solo_level, COUNT(*)::int AS count FROM concepts WHERE learner_id = $1 GROUP BY solo_level`,
      [learnerId]
    );
    const conceptStates = await db.query(
      `SELECT c.id, m.half_life, m.last_reviewed, m.decay_exempt, m.mastered_at,
              EXISTS (SELECT 1 FROM note_concepts nc JOIN notes n ON n.id = nc.note_id
                      WHERE nc.concept_id = c.id AND n.learner_id = c.learner_id) AS ingested
       FROM concepts c
       LEFT JOIN memory_states m ON m.concept_id = c.id AND m.learner_id = c.learner_id
       WHERE c.learner_id = $1`,
      [learnerId]
    );

    const now = Date.now();
    const bands = { strong: 0, fading: 0, weak: 0, unreviewed: 0 };
    let ingested = 0;
    let absorbed = 0;
    for (const row of conceptStates.rows) {
      const recall = computeRecall(row.last_reviewed, row.half_life, row.decay_exempt, now);
      if (recall === null) bands.unreviewed += 1;
      else if (recall >= RECALL_STRONG) bands.strong += 1;
      else if (recall >= RECALL_FADING) bands.fading += 1;
      else bands.weak += 1;

      if (row.ingested) {
        ingested += 1;
        const mastered = Boolean(row.mastered_at) || Boolean(row.decay_exempt);
        if (mastered || (recall !== null && recall >= RECALL_STRONG)) absorbed += 1;
      }
    }

    res.json({
      soloLevels: soloLevels.rows.map((r) => ({ solo_level: soloToUi(r.solo_level), count: r.count })),
      recallDistribution: Object.entries(bands).map(([band, count]) => ({ band, count })),
      absorptionEfficiency: ingested > 0 ? absorbed / ingested : null,
      absorption: { absorbed, ingested },
    });
  } catch (err) {
    console.error('Error computing analytics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Probe types that count as transfer / analogy evidence (schema.sql probe_type enum).
const TRANSFER_PROBE_TYPES = ['NEAR_TRANSFER', 'FAR_TRANSFER', 'ANALOGY_FORWARD', 'ANALOGY_SIMULATE', 'ANALOGY_BREAKDOWN'];

// GET /api/analytics/growth
// { points: [{ date, cumulative_concepts }] }
// Concept-creation timeline: one row per day a concept was created, with the
// running cumulative total. Empty array when the learner has no concepts yet.
router.get('/growth', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const daily = await db.query(
      `SELECT created_at::date AS date, COUNT(*)::int AS added
       FROM concepts
       WHERE learner_id = $1
       GROUP BY created_at::date
       ORDER BY created_at::date ASC`,
      [learnerId]
    );
    let cumulative = 0;
    const points = daily.rows.map((r) => {
      cumulative += r.added;
      return { date: r.date, cumulative_concepts: cumulative };
    });
    res.json({ points });
  } catch (err) {
    console.error('Error computing growth analytics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/activity
// { total_attempts, total_passes, concepts_reviewed, recent: [{ date, attempts, passes }] }
// recent is bucketed by day over the last 30 days (only days with activity).
router.get('/activity', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const totals = await db.query(
      `SELECT COUNT(*)::int AS total_attempts,
              COUNT(*) FILTER (WHERE passed)::int AS total_passes,
              COUNT(DISTINCT concept_id)::int AS concepts_reviewed
       FROM attempts
       WHERE learner_id = $1`,
      [learnerId]
    );
    const recent = await db.query(
      `SELECT submitted_at::date AS date,
              COUNT(*)::int AS attempts,
              COUNT(*) FILTER (WHERE passed)::int AS passes
       FROM attempts
       WHERE learner_id = $1 AND submitted_at >= NOW() - INTERVAL '30 days'
       GROUP BY submitted_at::date
       ORDER BY submitted_at::date ASC`,
      [learnerId]
    );
    const t = totals.rows[0] || {};
    res.json({
      total_attempts: t.total_attempts || 0,
      total_passes: t.total_passes || 0,
      concepts_reviewed: t.concepts_reviewed || 0,
      recent: recent.rows.map((r) => ({ date: r.date, attempts: r.attempts, passes: r.passes })),
    });
  } catch (err) {
    console.error('Error computing activity analytics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/transfer
// { items: [{ concept_id, concept_label, probe_type, score, passed, at }] }
// Recent passed transfer/analogy attempts (most recent first).
router.get('/transfer', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const rows = await db.query(
      `SELECT a.concept_id, c.canonical_label AS concept_label, p.type AS probe_type,
              a.composite_score AS score, a.passed, a.submitted_at AS at
       FROM attempts a
       JOIN probes p ON p.id = a.probe_id
       JOIN concepts c ON c.id = a.concept_id
       WHERE a.learner_id = $1 AND a.passed AND p.type = ANY($2::probe_type[])
       ORDER BY a.submitted_at DESC
       LIMIT 50`,
      [learnerId, TRANSFER_PROBE_TYPES]
    );
    res.json({
      items: rows.rows.map((r) => ({
        concept_id: r.concept_id,
        concept_label: r.concept_label,
        probe_type: r.probe_type,
        score: r.score,
        passed: r.passed,
        at: r.at,
      })),
    });
  } catch (err) {
    console.error('Error computing transfer analytics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/misconceptions
// { items: [{ tag, concept_id, concept_label, count, last_seen }] }
// Grouped by tag+concept, ordered by most recent occurrence.
router.get('/misconceptions', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const rows = await db.query(
      `SELECT me.tag, me.concept_id, c.canonical_label AS concept_label,
              COUNT(*)::int AS count, MAX(me.created_at) AS last_seen
       FROM misconception_events me
       JOIN concepts c ON c.id = me.concept_id
       WHERE me.learner_id = $1
       GROUP BY me.tag, me.concept_id, c.canonical_label
       ORDER BY MAX(me.created_at) DESC
       LIMIT 50`,
      [learnerId]
    );
    res.json({
      items: rows.rows.map((r) => ({
        tag: r.tag,
        concept_id: r.concept_id,
        concept_label: r.concept_label,
        count: r.count,
        last_seen: r.last_seen,
      })),
    });
  } catch (err) {
    console.error('Error computing misconception analytics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/capabilities
// { events: [{ event_type, concept_id, concept_label, detail, at }] }
// Demonstrated-capability timeline from capability_events (populated by the
// grader/memory pipeline going forward; empty is a valid, expected state).
router.get('/capabilities', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const rows = await db.query(
      `SELECT ce.event_type, ce.concept_id, c.canonical_label AS concept_label,
              ce.detail, ce.created_at AS at
       FROM capability_events ce
       JOIN concepts c ON c.id = ce.concept_id
       WHERE ce.learner_id = $1
       ORDER BY ce.created_at DESC
       LIMIT 50`,
      [learnerId]
    );
    res.json({
      events: rows.rows.map((r) => ({
        event_type: r.event_type,
        concept_id: r.concept_id,
        concept_label: r.concept_label,
        detail: r.detail || {},
        at: r.at,
      })),
    });
  } catch (err) {
    console.error('Error computing capability analytics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
