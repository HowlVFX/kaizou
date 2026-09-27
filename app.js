require('dotenv').config();
const express = require('express');
const app = express();

const authRoutes = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const userRoutes = require('./routes/users');
const { checkGateCredentials, issueGateToken, requireGate } = require('./middleware/gate');

// Secret, non-obvious base for the admin API (NOT /api/management). Configurable.
const ADMIN_API_BASE = process.env.ADMIN_API_BASE || '/api/_ctrl';

// To allow frontend at localhost:8443 to talk to backend
const cors = require('cors');
// CORS_ORIGIN is a comma-separated allowlist (frontend on :8443, portal on :5174 by default).
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8443,http://localhost:5174')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins }));

app.use(express.json()); // Middleware to parse JSON bodies

// --- Global site gate --------------------------------------------------------
// Everyone must clear a shared username/password before the learner app is
// usable. POST /api/gate exchanges the credentials for a short-lived gate
// token; requireGate then guards every learner route (auth included), so the
// gate cannot be bypassed by faking client state.
app.post('/api/gate', (req, res) => {
  const { username, password } = req.body || {};
  if (!checkGateCredentials(username, password)) {
    return res.status(401).json({ error: 'Invalid gate credentials' });
  }
  res.json({ gateToken: issueGateToken() });
});

// --- Learner routes (behind the global gate) ---------------------------------
app.use('/api/auth', requireGate, authRoutes);
// OAuth is a browser-redirect flow (provider -> callback) that can't carry the
// X-Gate-Token header, so it isn't behind the site gate. Signup is still
// invite-only via the allowlist, so this doesn't widen who can get an account.
app.use('/api/oauth', oauthRoutes);
app.use('/api/users', requireGate, userRoutes);
app.use('/api/notes', requireGate, require('./routes/notes'));
app.use('/api/concepts', requireGate, require('./routes/concepts'));
app.use('/api/graph', requireGate, require('./routes/graph'));
app.use('/api/clusters', requireGate, require('./routes/clusters'));
app.use('/api/review', requireGate, require('./routes/review'));
app.use('/api/analytics', requireGate, require('./routes/analytics'));
app.use('/api/learning-paths', requireGate, require('./routes/learning-paths'));

// --- Admin control plane (separate identity domain, secret base path) --------
// Not gated by the site gate: admins reach the portal directly, not through the
// learner app. Guarded per-route by admin token verification instead.
app.use(ADMIN_API_BASE, require('./routes/admin'));
app.use(`${ADMIN_API_BASE}/management/overview`, require('./routes/management/overview'));
app.use(`${ADMIN_API_BASE}/management/population`, require('./routes/management/population'));
app.use(`${ADMIN_API_BASE}/management/grader`, require('./routes/management/grader'));
app.use(`${ADMIN_API_BASE}/management/memory`, require('./routes/management/memory'));
app.use(`${ADMIN_API_BASE}/management/probes`, require('./routes/management/probes'));
app.use(`${ADMIN_API_BASE}/management/graph`, require('./routes/management/graph'));
app.use(`${ADMIN_API_BASE}/management/sources`, require('./routes/management/sources'));
app.use(`${ADMIN_API_BASE}/management/generation`, require('./routes/management/generation'));
app.use(`${ADMIN_API_BASE}/management/clusters`, require('./routes/management/clusters'));
app.use(`${ADMIN_API_BASE}/management/evaluation`, require('./routes/management/evaluation'));
app.use(`${ADMIN_API_BASE}/management/exports`, require('./routes/management/exports'));

// Original test routes
app.get('/', (req, res) => {
  res.send('Hello from Express');
});

// Last-resort error handler: malformed JSON bodies get a 400, anything else a
// generic 500. Details are logged server-side, never sent to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});