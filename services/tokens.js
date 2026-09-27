// Single source of truth for JWT issuing and verification.
//
// Access token payload:  { id, role, type: 'access' }  (15 min)
// Refresh token payload: { id, jti, type: 'refresh' }  (7 days, stored in
//   refresh_tokens so it can be revoked; rotated on every /refresh).
//
// There is deliberately no fallback secret: a missing JWT_SECRET must fail
// loudly rather than silently sign tokens with a public default.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database/db');

const ACCESS_TTL = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_TTL_DAYS = 7;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

function signAccessToken(learner) {
  return jwt.sign(
    { id: learner.id, role: learner.role || 'learner', type: 'access' },
    getJwtSecret(),
    { expiresIn: ACCESS_TTL },
  );
}

/** Issue an access + refresh pair and persist the refresh token. */
async function issueTokens(learner) {
  const accessToken = signAccessToken(learner);
  // jti keeps the token string unique (refresh_tokens.token is UNIQUE).
  const refreshToken = jwt.sign(
    { id: learner.id, jti: crypto.randomUUID(), type: 'refresh' },
    getJwtSecret(),
    { expiresIn: `${REFRESH_TTL_DAYS}d` },
  );
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO refresh_tokens (learner_id, token, expires_at) VALUES ($1, $2, $3)',
    [learner.id, refreshToken, expiresAt],
  );
  return { accessToken, refreshToken };
}

/**
 * Validate a refresh token, revoke it, and issue a fresh pair (rotation).
 * Returns { learner, accessToken, refreshToken } or null if invalid.
 */
async function rotateRefreshToken(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, getJwtSecret());
  } catch {
    return null;
  }
  if (decoded.type !== 'refresh') return null;

  // Delete-and-return makes the token single-use even under concurrent calls.
  const del = await db.query(
    'DELETE FROM refresh_tokens WHERE token = $1 AND expires_at > NOW() RETURNING learner_id',
    [refreshToken],
  );
  if (del.rowCount === 0) return null;

  const result = await db.query('SELECT id, email, name, role FROM learners WHERE id = $1', [del.rows[0].learner_id]);
  const learner = result.rows[0];
  if (!learner) return null;

  const tokens = await issueTokens(learner);
  return { learner, ...tokens };
}

async function revokeRefreshToken(refreshToken) {
  await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
}

/** Verify an access token. Throws on invalid/expired/wrong-type tokens. */
function verifyAccessToken(token) {
  const decoded = jwt.verify(token, getJwtSecret());
  // Refresh tokens must never be accepted as access tokens. Tokens minted
  // before `type` existed have no type; treat them as access for continuity.
  if (decoded.type && decoded.type !== 'access') {
    throw new jwt.JsonWebTokenError('wrong token type');
  }
  return decoded;
}

module.exports = {
  getJwtSecret,
  signAccessToken,
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  verifyAccessToken,
};
