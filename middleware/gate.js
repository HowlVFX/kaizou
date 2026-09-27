// Global site gate: a shared username+password that must be cleared before the
// learner app is usable at all (like a company dev-site splash gate).
//
// POST /api/gate {username,password} -> { gateToken } (a short-lived signed
// token). The learner app stores it and sends it as X-Gate-Token on every
// learner API call. requireGate rejects calls without a valid token, so the
// gate can't be bypassed by faking client-side state.
//
// This is a coarse "keep the public out" gate, NOT per-user identity — every
// visitor uses the same GATE_USERNAME/GATE_PASSWORD.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const GATE_TTL = process.env.GATE_TOKEN_EXPIRY || '12h';

function gateSecret() {
  // Derived from the credentials so changing them invalidates old gate tokens;
  // salted with JWT_SECRET so the token can't be forged without server secrets.
  const base = `${process.env.GATE_USERNAME || ''}:${process.env.GATE_PASSWORD || ''}:${process.env.JWT_SECRET || ''}`;
  return crypto.createHash('sha256').update(base).digest('hex');
}

function checkGateCredentials(username, password) {
  const u = process.env.GATE_USERNAME || '';
  const p = process.env.GATE_PASSWORD || '';
  if (!u || !p) return false; // gate not configured -> refuse (fail closed)
  // Constant-time compare on both fields.
  const uOk = Buffer.byteLength(username || '') === Buffer.byteLength(u)
    && crypto.timingSafeEqual(Buffer.from(String(username || '')), Buffer.from(u));
  const pOk = Buffer.byteLength(password || '') === Buffer.byteLength(p)
    && crypto.timingSafeEqual(Buffer.from(String(password || '')), Buffer.from(p));
  return uOk && pOk;
}

function issueGateToken() {
  return jwt.sign({ gate: true }, gateSecret(), { expiresIn: GATE_TTL });
}

function verifyGateToken(token) {
  try {
    const decoded = jwt.verify(token, gateSecret());
    return decoded && decoded.gate === true;
  } catch {
    return false;
  }
}

// Express middleware: require a valid gate token on learner API calls.
function requireGate(req, res, next) {
  const token = req.headers['x-gate-token'];
  if (token && verifyGateToken(String(token))) return next();
  return res.status(401).json({ error: 'Site gate not cleared', code: 'gate_required' });
}

module.exports = { checkGateCredentials, issueGateToken, verifyGateToken, requireGate };
