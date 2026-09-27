const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same rule as routes/auth.js signup
const PROFILE_COLS = 'id, email, name, preferred_language, portal_optin, daily_goal, review_mode, decay_sensitivity, solo_notifications, created_at';
const UPDATABLE = new Set([
  'name', 'email', 'preferred_language', 'portal_optin',
  'daily_goal', 'review_mode', 'decay_sensitivity', 'solo_notifications',
]);

// Learning-preference enums (must match migration 005 / schema.sql).
const REVIEW_MODES = new Set(['Understand', 'Abstract']);
const DECAY_SENSITIVITIES = new Set(['Low', 'Standard', 'High']);

// 1. GET CURRENT USER PROFILE
// Response: { id, email, name, preferred_language, portal_optin,
//             daily_goal, review_mode, decay_sensitivity, solo_notifications, created_at }
router.get('/me', verifyToken, async (req, res) => {
  try {
    // Fetch the user, but intentionally exclude password_hash for security
    const result = await db.query(`SELECT ${PROFILE_COLS} FROM learners WHERE id = $1`, [req.user.id]);
    const learner = result.rows[0];
    if (!learner) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(learner);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. UPDATE CURRENT USER PROFILE
// Body: any subset of { name, email, preferred_language, portal_optin,
//                       daily_goal, review_mode, decay_sensitivity, solo_notifications }.
// Unknown fields (including role/id) -> 400 listing them; nothing is written.
// Response: { message, learner: <same shape as GET /me> }
router.put('/me', verifyToken, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
  if (!body) return res.status(400).json({ error: 'JSON object body required' });

  const unknown = Object.keys(body).filter((k) => !UPDATABLE.has(k));
  if (unknown.length) {
    return res.status(400).json({ error: 'Unknown or read-only fields', fields: unknown });
  }

  const sets = [];
  const params = [];
  const set = (col, value) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };

  if (body.name !== undefined) {
    if (body.name !== null && typeof body.name !== 'string') {
      return res.status(400).json({ error: 'name must be a string' });
    }
    const name = body.name === null ? null : body.name.trim();
    if (name && name.length > 100) return res.status(400).json({ error: 'name must be at most 100 characters' });
    set('name', name || null);
  }
  if (body.email !== undefined) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > 255 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    set('email', email);
  }
  if (body.preferred_language !== undefined) {
    if (typeof body.preferred_language !== 'string' || !/^[A-Za-z-]{2,10}$/.test(body.preferred_language)) {
      return res.status(400).json({ error: 'Invalid preferred_language' });
    }
    set('preferred_language', body.preferred_language);
  }
  if (body.portal_optin !== undefined) {
    if (typeof body.portal_optin !== 'boolean') {
      return res.status(400).json({ error: 'portal_optin must be a boolean' });
    }
    set('portal_optin', body.portal_optin);
  }
  if (body.daily_goal !== undefined) {
    if (typeof body.daily_goal !== 'number' || !Number.isInteger(body.daily_goal) || body.daily_goal < 1 || body.daily_goal > 50) {
      return res.status(400).json({ error: 'daily_goal must be an integer between 1 and 50' });
    }
    set('daily_goal', body.daily_goal);
  }
  if (body.review_mode !== undefined) {
    if (typeof body.review_mode !== 'string' || !REVIEW_MODES.has(body.review_mode)) {
      return res.status(400).json({ error: "review_mode must be 'Understand' or 'Abstract'" });
    }
    set('review_mode', body.review_mode);
  }
  if (body.decay_sensitivity !== undefined) {
    if (typeof body.decay_sensitivity !== 'string' || !DECAY_SENSITIVITIES.has(body.decay_sensitivity)) {
      return res.status(400).json({ error: "decay_sensitivity must be 'Low', 'Standard' or 'High'" });
    }
    set('decay_sensitivity', body.decay_sensitivity);
  }
  if (body.solo_notifications !== undefined) {
    if (typeof body.solo_notifications !== 'boolean') {
      return res.status(400).json({ error: 'solo_notifications must be a boolean' });
    }
    set('solo_notifications', body.solo_notifications);
  }

  try {
    const learnerId = req.user.id;
    let result;
    if (sets.length === 0) {
      result = await db.query(`SELECT ${PROFILE_COLS} FROM learners WHERE id = $1`, [learnerId]);
    } else {
      if (body.email !== undefined) {
        // Case-insensitive duplicate check (legacy rows may not be lowercased).
        const dup = await db.query(
          'SELECT 1 FROM learners WHERE LOWER(email) = $1 AND id <> $2',
          [params[sets.findIndex((s) => s.startsWith('email'))], learnerId]
        );
        if (dup.rowCount > 0) return res.status(409).json({ error: 'Email already exists' });
      }
      params.push(learnerId);
      result = await db.query(
        `UPDATE learners SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${PROFILE_COLS}`,
        params
      );
    }

    const updatedLearner = result.rows[0];
    if (!updatedLearner) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      learner: updatedLearner
    });
  } catch (error) {
    // 23505 = unique violation (email taken between the check and the update)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. RESET PROGRESS
// Clears the learner's RECALL/MEMORY progress without deleting their notes or
// concepts. Resets memory_states to a fresh state, deletes graded history
// (attempts + their misconception/capability events) and rolls concept
// progress-derived fields (solo_level, c_current) back to their initial values.
// Canonical content — labels, claims, edges, track/shape/category, notes — is
// left untouched. All writes run in a single transaction.
// Response: { message, cleared: { memory_states, attempts, concepts_reset } }
router.post('/me/reset-progress', verifyToken, async (req, res) => {
  const learnerId = req.user.id;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Graded history first (children before parents): capability_events and
    // misconception_events reference attempts, so delete them ahead of attempts.
    await client.query('DELETE FROM capability_events WHERE learner_id = $1', [learnerId]);
    await client.query('DELETE FROM misconception_events WHERE learner_id = $1', [learnerId]);
    const attemptsResult = await client.query('DELETE FROM attempts WHERE learner_id = $1', [learnerId]);

    // Reset memory scheduling state. half_life goes back to the concept's
    // initial h_0 = 1/C (using c_0, the concept's initial capacity); fall back
    // to the schema default of 1.0 when c_0 is missing or zero.
    const memoryResult = await client.query(
      `UPDATE memory_states ms
          SET half_life = COALESCE(1.0 / NULLIF(c.c_0, 0), 1.0),
              last_reviewed = NULL,
              streak = 0,
              attempts = 0,
              passes = 0,
              decay_exempt = false,
              mastered_at = NULL,
              stagnation_clock = 0
         FROM concepts c
        WHERE ms.concept_id = c.id
          AND ms.learner_id = $1`,
      [learnerId]
    );

    // Roll concept progress-derived fields back to their initial values.
    // Canonical fields (label, track, shape, category, claims, edges) are not touched.
    const conceptsResult = await client.query(
      `UPDATE concepts
          SET solo_level = 'Prestructural',
              c_current = c_0
        WHERE learner_id = $1`,
      [learnerId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Progress reset successfully',
      cleared: {
        memory_states: memoryResult.rowCount,
        attempts: attemptsResult.rowCount,
        concepts_reset: conceptsResult.rowCount,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back reset-progress:', rollbackError);
    }
    console.error('Error resetting progress:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
