// Admin authentication + authorization for the management API.
//
// verifyAdmin: requires a valid admin access token (separate secret + aud).
//   Sets req.admin = { id, admin_role }. Returns 401 (not 403) and does NOT
//   confirm the route exists, so probing the secret base path from a learner
//   context reveals nothing.
// requireOwner: further restricts a route to owners.
const jwt = require('jsonwebtoken');
const { verifyAdminAccessToken } = require('../services/admin-tokens');

function verifyAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.admin = verifyAdminAccessToken(token);
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired', code: 'token_expired' });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function requireOwner(req, res, next) {
  if (req.admin && req.admin.admin_role === 'owner') return next();
  return res.status(403).json({ error: 'Owner access required' });
}

module.exports = { verifyAdmin, requireOwner };
