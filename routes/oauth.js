const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const { issueTokens } = require('../services/tokens');
const { oauthStates, loginCodes } = require('../services/oauth-store');
const router = express.Router();

// Flow:
//   1. GET /api/oauth/<provider>          -> redirect to provider with a random `state`
//   2. GET /api/oauth/<provider>/callback -> verify state, require a VERIFIED email,
//      find/create the learner, issue tokens, then redirect to
//      `${FRONTEND_URL}/auth-callback?code=<one-time code>` (tokens never go in a URL)
//   3. POST /api/oauth/exchange {code}   -> 200 { accessToken, refreshToken, learner }
//      The code is single use and expires after 60 s.
// Errors redirect to `${FRONTEND_URL}/login?error=<reason>`.
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:8443').replace(/\/+$/, '');
const CALLBACK_BASE = (process.env.OAUTH_CALLBACK_BASE || 'http://localhost:3000').replace(/\/+$/, '');
const GITHUB_REDIRECT_URI = `${CALLBACK_BASE}/api/oauth/github/callback`;
const GOOGLE_REDIRECT_URI = `${CALLBACK_BASE}/api/oauth/google/callback`;

// Strip any invisible carriage returns or spaces that sneak into .env values.
const envClean = (name) => (process.env[name] || '').replace(/[\r\n\s]/g, '');

function redirectError(res, reason) {
  res.redirect(`${FRONTEND_URL}/login?${new URLSearchParams({ error: reason })}`);
}

/** Check the callback's state against the one we issued for this provider. */
function checkState(req, provider) {
  const stored = oauthStates.take(req.query.state);
  return Boolean(stored && stored.provider === provider);
}

// Find or create the learner for a provider-verified email, issue tokens and
// hand the frontend a one-time code for them.
async function handleOAuthUser(rawEmail, rawName, res) {
  try {
    const email = String(rawEmail).trim().toLowerCase();
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim().slice(0, 100) : null;

    // LOWER() so accounts created before emails were normalised still match.
    let result = await db.query('SELECT id, email, name, role FROM learners WHERE LOWER(email) = $1', [email]);
    let learner = result.rows[0];

    if (!learner) {
      // OAuth-only accounts get an unusable password: a bcrypt hash of 32
      // random bytes that is never shown to anyone.
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      result = await db.query(
        'INSERT INTO learners (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, role',
        [email, passwordHash, name]
      );
      learner = result.rows[0];
    } else if (!learner.name && name) {
      result = await db.query(
        'UPDATE learners SET name = $1 WHERE id = $2 RETURNING id, email, name, role',
        [name, learner.id]
      );
      learner = result.rows[0];
    }

    const { accessToken, refreshToken } = await issueTokens(learner);
    const code = loginCodes.put({
      accessToken,
      refreshToken,
      learner: { id: learner.id, email: learner.email, name: learner.name, role: learner.role },
    });
    res.redirect(`${FRONTEND_URL}/auth-callback?${new URLSearchParams({ code })}`);
  } catch (error) {
    console.error('OAuth user handling error:', error);
    redirectError(res, 'oauth_failed');
  }
}

// ----------------------------------------------------
// ONE-TIME CODE EXCHANGE
// ----------------------------------------------------
router.post('/exchange', (req, res) => {
  const code = req.body && req.body.code;
  if (typeof code !== 'string' || !code) {
    return res.status(400).json({ error: 'code is required' });
  }
  const session = loginCodes.take(code);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired code' });
  }
  res.json(session);
});

// ----------------------------------------------------
// GITHUB OAUTH
// ----------------------------------------------------

// 1. Send the user to GitHub
router.get('/github', (req, res) => {
  const state = oauthStates.put({ provider: 'github' });
  const params = new URLSearchParams({
    client_id: envClean('GITHUB_CLIENT_ID'),
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: 'user:email', // needed to read (verified) emails
    state,
    prompt: 'consent',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// 2. GitHub sends them back here
router.get('/github/callback', async (req, res) => {
  if (req.query.error) return redirectError(res, 'access_denied');
  if (!checkState(req, 'github')) return redirectError(res, 'invalid_state');
  const code = req.query.code;
  if (!code || typeof code !== 'string') return redirectError(res, 'no_code_provided');

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: envClean('GITHUB_CLIENT_ID'),
        client_secret: envClean('GITHUB_CLIENT_SECRET'),
        code,
        redirect_uri: GITHUB_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenResponse.json();
    const githubAccessToken = tokenData.access_token;
    if (!githubAccessToken) throw new Error('Failed to get GitHub access token');

    const ghHeaders = { 'Authorization': `Bearer ${githubAccessToken}`, 'Accept': 'application/vnd.github+json' };
    const emailResponse = await fetch('https://api.github.com/user/emails', { headers: ghHeaders });
    const emails = emailResponse.ok ? await emailResponse.json() : [];

    // Only a VERIFIED email may be used, otherwise anyone could add a
    // victim's address to their GitHub account and log in as them.
    const verified = Array.isArray(emails) ? emails.filter((e) => e && e.verified === true && e.email) : [];
    const chosen = verified.find((e) => e.primary) || verified[0];
    if (!chosen) return redirectError(res, 'email_not_verified');

    const userResponse = await fetch('https://api.github.com/user', { headers: ghHeaders });
    const userData = userResponse.ok ? await userResponse.json() : {};
    const name = userData.name || userData.login;

    await handleOAuthUser(chosen.email, name, res);
  } catch (error) {
    console.error('GitHub OAuth error:', error.message);
    redirectError(res, 'github_oauth_failed');
  }
});

// ----------------------------------------------------
// GOOGLE OAUTH
// ----------------------------------------------------

// 1. Send the user to Google
router.get('/google', (req, res) => {
  const state = oauthStates.put({ provider: 'google' });
  const params = new URLSearchParams({
    client_id: envClean('GOOGLE_CLIENT_ID'),
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// 2. Google sends them back here
router.get('/google/callback', async (req, res) => {
  if (req.query.error) return redirectError(res, 'access_denied');
  if (!checkState(req, 'google')) return redirectError(res, 'invalid_state');
  const code = req.query.code;
  if (!code || typeof code !== 'string') return redirectError(res, 'no_code_provided');

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: envClean('GOOGLE_CLIENT_ID'),
        client_secret: envClean('GOOGLE_CLIENT_SECRET'),
        code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenResponse.json();
    const googleAccessToken = tokenData.access_token;
    if (!googleAccessToken) throw new Error('Failed to get Google access token');

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` },
    });
    const profileData = profileResponse.ok ? await profileResponse.json() : {};

    // v2 userinfo uses `verified_email`; OIDC userinfo uses `email_verified`.
    const emailVerified = profileData.verified_email === true || profileData.email_verified === true;
    if (!profileData.email || !emailVerified) return redirectError(res, 'email_not_verified');

    await handleOAuthUser(profileData.email, profileData.name, res);
  } catch (error) {
    console.error('Google OAuth error:', error.message);
    redirectError(res, 'google_oauth_failed');
  }
});

module.exports = router;
