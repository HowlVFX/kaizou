// Admin (management) auth + control-plane routes. Mounted at ADMIN_API_BASE
// (a secret, non-obvious path — NOT /api/management), so its existence is not
// discoverable from the learner app. All routes except /login and /refresh
// require a valid admin token.
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const {
  issueAdminTokens, rotateAdminRefreshToken, revokeAdminRefreshToken,
} = require('../services/admin-tokens');
const { verifyAdmin, requireOwner } = require('../middleware/admin-auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Auth --------------------------------------------------------------------

// POST /login {email, password} -> { admin:{id,email,name,admin_role}, accessToken, refreshToken }
router.post('/login', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    const result = await db.query(
      'SELECT id, email, name, admin_role, password_hash FROM admins WHERE LOWER(email) = $1', [email],
    );
    const admin = result.rows[0];
    const match = admin ? await bcrypt.compare(password, admin.password_hash) : false;
    if (!admin || !match) return res.status(401).json({ error: 'Invalid email or password' });

    await db.query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [admin.id]);
    const { accessToken, refreshToken } = await issueAdminTokens(admin);
    res.json({
      admin: { id: admin.id, email: admin.email, name: admin.name, admin_role: admin.admin_role },
      accessToken, refreshToken,
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });
  try {
    const rotated = await rotateAdminRefreshToken(refreshToken);
    if (!rotated) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    const { admin, accessToken, refreshToken: newRefresh } = rotated;
    res.json({
      admin: { id: admin.id, email: admin.email, name: admin.name, admin_role: admin.admin_role },
      accessToken, refreshToken: newRefresh,
    });
  } catch (error) {
    console.error('Admin refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body || {};
  try {
    if (refreshToken) await revokeAdminRefreshToken(refreshToken);
    res.status(204).end();
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /me -> the current admin's identity
router.get('/me', verifyAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, admin_role, created_at, last_login_at FROM admins WHERE id = $1',
      [req.admin.id],
    );
    if (result.rowCount === 0) return res.status(401).json({ error: 'Unauthorized' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Admin me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Signup allowlist (owner + moderator) ------------------------------------

// GET /allowlist -> [{ id, email, note, created_at, used_at, added_by_email }]
router.get('/allowlist', verifyAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.id, s.email, s.note, s.created_at, s.used_at, a.email AS added_by_email
       FROM signup_allowlist s
       LEFT JOIN admins a ON a.id = s.added_by
       ORDER BY s.created_at DESC`,
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Allowlist list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /allowlist {email, note?} -> adds an email that may then sign up
router.post('/allowlist', verifyAdmin, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 200) : null;
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  try {
    const result = await db.query(
      `INSERT INTO signup_allowlist (email, added_by, note) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET note = EXCLUDED.note
       RETURNING id, email, note, created_at, used_at`,
      [email, req.admin.id, note],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Allowlist add error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /allowlist/:id -> removes an email from the allowlist
router.delete('/allowlist/:id', verifyAdmin, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM signup_allowlist WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Removed', id: req.params.id });
  } catch (error) {
    console.error('Allowlist remove error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Admin management (OWNER ONLY; owners are protected) ----------------------

// GET /admins -> list all admins
router.get('/admins', verifyAdmin, requireOwner, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, admin_role, created_at, last_login_at FROM admins ORDER BY created_at ASC',
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Admins list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admins {email, password, name?} -> create a MODERATOR (never an owner)
router.post('/admins', verifyAdmin, requireOwner, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password } = req.body || {};
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 100) : null;
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    // admin_role is forced to 'moderator' — owners are created only out-of-band.
    const result = await db.query(
      `INSERT INTO admins (email, password_hash, name, admin_role)
       VALUES ($1, $2, $3, 'moderator')
       RETURNING id, email, name, admin_role, created_at`,
      [email, hash, name],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An admin with this email already exists' });
    console.error('Admin create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /admins/:id -> remove a moderator. Owners are protected: an owner row
// can never be deleted via the API, and an admin cannot delete themselves.
router.delete('/admins/:id', verifyAdmin, requireOwner, async (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.admin.id) return res.status(400).json({ error: 'You cannot remove yourself' });
  try {
    const target = await db.query('SELECT admin_role FROM admins WHERE id = $1', [targetId]);
    if (target.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    if (target.rows[0].admin_role === 'owner') {
      return res.status(403).json({ error: 'Owners are protected and cannot be removed' });
    }
    await db.query('DELETE FROM admins WHERE id = $1', [targetId]);
    res.json({ message: 'Removed', id: targetId });
  } catch (error) {
    console.error('Admin remove error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
