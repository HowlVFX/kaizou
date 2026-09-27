const jwt = require('jsonwebtoken');
const { verifyAccessToken } = require('../services/tokens');

// Middleware to protect routes that require a user to be logged in.
// Sets req.user = { id, type }. (Learners carry no role — admin is a separate
// identity domain, see services/admin-tokens.js.)
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Access Denied. No token provided.' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Access Denied. Invalid token format.' });
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    // 401 for expiry so clients know to call /api/auth/refresh; 403 otherwise.
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired', code: 'token_expired' });
    }
    return res.status(403).json({ error: 'Invalid token.' });
  }
}

module.exports = verifyToken;
