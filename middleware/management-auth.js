// Must run after verifyToken. The access token carries `role` (see
// services/tokens.js); tokens minted before that change have no role and
// are rejected here until the admin logs in again.
const managementAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden: Admin access required' });
};

module.exports = managementAuth;
