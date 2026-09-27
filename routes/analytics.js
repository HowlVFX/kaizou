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

module.exports = router;
