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

// 1 MB: room for a note body plus an uploaded/pasted source (capped at 200k chars).
app.use(express.json({ limit: '1mb' }));

// --- Site gate --------------------------------------------------------------
// A shared username/password that guards the MANAGEMENT PORTAL (a dev-site
// splash before the admin login). POST /api/gate exchanges the shared
// credentials for a short-lived gate token; requireGate guards the admin API.
// The learner app is NOT gated — learners use normal signup/login (invite-only).
app.post('/api/gate', (req, res) => {
  const { username, password } = req.body || {};
  if (!checkGateCredentials(username, password)) {
    return res.status(401).json({ error: 'Invalid gate credentials' });
  }
  res.json({ gateToken: issueGateToken() });
});

// --- Learner routes (public-facing app; no site gate) ------------------------
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notes', require('./routes/notes'));
app.use('/api/concepts', require('./routes/concepts'));
app.use('/api/graph', require('./routes/graph'));
app.use('/api/clusters', require('./routes/clusters'));
app.use('/api/review', require('./routes/review'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/learning-paths', require('./routes/learning-paths'));

// --- Admin control plane (separate identity domain, secret base path) --------
// Behind the site gate (shared splash credentials) AND per-route admin-token
// auth: the portal must clear the gate before it can even reach admin login.
app.use(ADMIN_API_BASE, requireGate, require('./routes/admin'));
const mgmt = `${ADMIN_API_BASE}/management`;
app.use(`${mgmt}/overview`, requireGate, require('./routes/management/overview'));
app.use(`${mgmt}/population`, requireGate, require('./routes/management/population'));
app.use(`${mgmt}/grader`, requireGate, require('./routes/management/grader'));
app.use(`${mgmt}/memory`, requireGate, require('./routes/management/memory'));
app.use(`${mgmt}/probes`, requireGate, require('./routes/management/probes'));
app.use(`${mgmt}/graph`, requireGate, require('./routes/management/graph'));
app.use(`${mgmt}/sources`, requireGate, require('./routes/management/sources'));
app.use(`${mgmt}/generation`, requireGate, require('./routes/management/generation'));
app.use(`${mgmt}/clusters`, requireGate, require('./routes/management/clusters'));
app.use(`${mgmt}/evaluation`, requireGate, require('./routes/management/evaluation'));
app.use(`${mgmt}/exports`, requireGate, require('./routes/management/exports'));

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