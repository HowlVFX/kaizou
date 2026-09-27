// Admin JWT issuing/verification — a SEPARATE identity domain from learners.
//
// Signed with ADMIN_JWT_SECRET (not JWT_SECRET) and stamped aud:'admin', so a
// learner access token is cryptographically invalid for admin routes and vice
// versa. Refresh tokens live in admin_refresh_tokens (rotated + revocable).
//
// No fallback secret: a missing ADMIN_JWT_SECRET fails loudly.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database/db');

const ACCESS_TTL = process.env.ADMIN_JWT_ACCESS_EXPIRY || '15m';
const REFRESH_TTL_DAYS = 7;
const AUDIENCE = 'admin';

function getAdminJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error('ADMIN_JWT_SECRET is not set');
  return secret;
}

function signAdminAccessToken(admin) {
  return jwt.sign(
    { id: admin.id, admin_role: admin.admin_role, type: 'access' },
    getAdminJwtSecret(),
    { expiresIn: ACCESS_TTL, audience: AUDIENCE },
  );
}

/** Issue an access + refresh pair for an admin and persist the refresh token. */
async function issueAdminTokens(admin) {
  const accessToken = signAdminAccessToken(admin);
  const refreshToken = jwt.sign(
    { id: admin.id, jti: crypto.randomUUID(), type: 'refresh' },
    getAdminJwtSecret(),
    { expiresIn: `${REFRESH_TTL_DAYS}d`, audience: AUDIENCE },
  );
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO admin_refresh_tokens (admin_id, token, expires_at) VALUES ($1, $2, $3)',
    [admin.id, refreshToken, expiresAt],
  );
  return { accessToken, refreshToken };
}

/** Validate an admin refresh token, revoke it, and issue a fresh pair. */
async function rotateAdminRefreshToken(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, getAdminJwtSecret(), { audience: AUDIENCE });
  } catch {
    return null;
  }
  if (decoded.type !== 'refresh') return null;

  const del = await db.query(
    'DELETE FROM admin_refresh_tokens WHERE token = $1 AND expires_at > NOW() RETURNING admin_id',
    [refreshToken],
  );
  if (del.rowCount === 0) return null;

  const result = await db.query(
    'SELECT id, email, name, admin_role FROM admins WHERE id = $1', [del.rows[0].admin_id],
  );
  const admin = result.rows[0];
  if (!admin) return null;

  const tokens = await issueAdminTokens(admin);
  return { admin, ...tokens };
}

async function revokeAdminRefreshToken(refreshToken) {
  await db.query('DELETE FROM admin_refresh_tokens WHERE token = $1', [refreshToken]);
}

/** Verify an admin access token. Throws on invalid/expired/wrong-type/wrong-aud. */
function verifyAdminAccessToken(token) {
  const decoded = jwt.verify(token, getAdminJwtSecret(), { audience: AUDIENCE });
  if (decoded.type && decoded.type !== 'access') {
    throw new jwt.JsonWebTokenError('wrong token type');
  }
  return decoded;
}

module.exports = {
  issueAdminTokens,
  rotateAdminRefreshToken,
  revokeAdminRefreshToken,
  verifyAdminAccessToken,
};
