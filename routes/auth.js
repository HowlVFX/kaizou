const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const { issueTokens, rotateRefreshToken, revokeRefreshToken } = require('../services/tokens');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6; // matches the frontend validation

// 1. SIGNUP ROUTE
router.post('/signup', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password } = req.body;
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 100) : null;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  }

  try {
    // Invite-only: the email must be on the admin-managed allowlist.
    const allow = await db.query('SELECT id FROM signup_allowlist WHERE email = $1', [email]);
    if (allow.rowCount === 0) {
      return res.status(403).json({ error: 'This email is not approved for signup. Ask an administrator for access.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO learners (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, passwordHash, name || null]
    );
    const newLearner = result.rows[0];
    // Mark the invite consumed (kept for audit; a used invite can't be reused
    // because the learners.email UNIQUE constraint blocks a second signup).
    await db.query('UPDATE signup_allowlist SET used_at = NOW() WHERE email = $1 AND used_at IS NULL', [email]);
    const { accessToken, refreshToken } = await issueTokens(newLearner);

    res.status(201).json({
      message: 'Learner registered successfully',
      learner: newLearner,
      accessToken,
      refreshToken
    });
  } catch (error) {
    // 23505 = unique violation (duplicate email)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

// 2. LOGIN ROUTE
router.post('/login', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // LOWER() so accounts created before emails were normalised still match.
    const result = await db.query('SELECT * FROM learners WHERE LOWER(email) = $1', [email]);
    const learner = result.rows[0];

    // Same message for unknown email and wrong password (no account enumeration).
    const passwordMatch = learner ? await bcrypt.compare(password, learner.password_hash) : false;
    if (!learner || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { accessToken, refreshToken } = await issueTokens(learner);

    res.json({
      message: 'Login successful',
      learner: { id: learner.id, email: learner.email, name: learner.name },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// 3. REFRESH: exchange a valid refresh token for a new pair (the old one is revoked).
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });

  try {
    const rotated = await rotateRefreshToken(refreshToken);
    if (!rotated) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    const { learner, accessToken, refreshToken: newRefresh } = rotated;
    res.json({ learner, accessToken, refreshToken: newRefresh });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Internal server error during refresh' });
  }
});

// 4. LOGOUT: revoke the refresh token (access tokens expire on their own).
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body || {};
  try {
    if (refreshToken) await revokeRefreshToken(refreshToken);
    res.status(204).end();
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error during logout' });
  }
});

module.exports = router;
