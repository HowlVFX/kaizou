const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same rule as routes/auth.js signup
const PROFILE_COLS = 'id, email, name, role, preferred_language, portal_optin, created_at';
const UPDATABLE = new Set(['name', 'email', 'preferred_language', 'portal_optin']);

// 1. GET CURRENT USER PROFILE
// Response: { id, email, name, role, preferred_language, portal_optin, created_at }
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
// Body: any subset of { name, email, preferred_language, portal_optin }.
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

module.exports = router;
