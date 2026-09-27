// Management-API guard. Admins are a SEPARATE identity domain (own table, own
// token secret, aud='admin') — NOT learners with a role flag. This delegates
// to verifyAdmin and, for backward compatibility with routers that read
// req.user.id as the acting rater, also exposes the admin as req.user.
//
// Returns 401 (never 403 for "not admin") and does not confirm the route
// exists, so probing the secret admin base path reveals nothing.
const { verifyAdmin } = require('./admin-auth');

const managementAuth = (req, res, next) => {
  verifyAdmin(req, res, () => {
    req.user = req.admin; // { id, admin_role } — grader.js uses req.user.id as the rater
    next();
  });
};

module.exports = managementAuth;
