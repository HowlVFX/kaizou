const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const router = express.Router();

const FRONTEND_URL = 'http://localhost:8443'; // Default Vite port

// Helper to generate tokens
const generateTokens = (learnerId) => {
  const secret = process.env.JWT_SECRET;
  const accessToken = jwt.sign({ id: learnerId }, secret, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: learnerId }, secret, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// Helper to find or create a user by email, and generate tokens
async function handleOAuthUser(email, name, res) {
  try {
    // 1. Check if user already exists
    let result = await db.query('SELECT * FROM learners WHERE email = $1', [email]);
    let learner = result.rows[0];

    if (!learner) {
      // 2. If not, create them. We generate a random password hash since they use OAuth.
      // (Bcrypting a random string ensures they can't login via password unless they reset it later)
      const randomPassword = Math.random().toString(36).slice(-8);
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      result = await db.query(
        'INSERT INTO learners (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *',
        [email, passwordHash, name]
      );
      learner = result.rows[0];
    } else if (!learner.name && name) {
      // Update name if they didn't have one
      result = await db.query(
        'UPDATE learners SET name = $1 WHERE id = $2 RETURNING *',
        [name, learner.id]
      );
      learner = result.rows[0];
    }

    // 3. Generate JWTs
    const { accessToken, refreshToken } = generateTokens(learner.id);

    // 4. Store the refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await db.query(
      'INSERT INTO refresh_tokens (learner_id, token, expires_at) VALUES ($1, $2, $3)',
      [learner.id, refreshToken, expiresAt]
    );

    // 5. Redirect back to the frontend with the tokens in the URL
    // The frontend will grab these from the URL and store them in localStorage
    res.redirect(`${FRONTEND_URL}/auth-callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);

  } catch (error) {
    console.error('OAuth User Handling Error:', error);
    res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
}

// ----------------------------------------------------
// GITHUB OAUTH
// ----------------------------------------------------

// 1. Send the user to GitHub
router.get('/github', (req, res) => {
  const clientId = (process.env.GITHUB_CLIENT_ID || '').replace(/[\r\n\s]/g, '');
  const redirectUri = 'http://localhost:3000/api/oauth/github/callback';
  // We request 'user:email' scope to make sure we get their email
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email&prompt=consent`;
  res.redirect(githubAuthUrl);
});

// 2. GitHub sends them back here
router.get('/github/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/login?error=no_code_provided`);
  }

  try {
    // Exchange the code for an access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID?.trim(),
        client_secret: process.env.GITHUB_CLIENT_SECRET?.trim(),
        code: code,
      }),
    });

    const tokenData = await tokenResponse.json();
    const githubAccessToken = tokenData.access_token;

    if (!githubAccessToken) {
      throw new Error('Failed to get GitHub access token');
    }

    // Fetch the user's emails
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${githubAccessToken}`,
      },
    });

    const emails = await emailResponse.json();
    // GitHub returns an array of emails; find the primary one
    const primaryEmailObj = emails.find(e => e.primary);
    const email = primaryEmailObj ? primaryEmailObj.email : emails[0].email;

    // Fetch the user's profile to get their name
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${githubAccessToken}`,
      },
    });
    const userData = await userResponse.json();
    const name = userData.name || userData.login;

    // Delegate to our helper to create the JWT and redirect to frontend
    await handleOAuthUser(email, name, res);

  } catch (error) {
    console.error('GitHub OAuth Error:', error);
    res.redirect(`${FRONTEND_URL}/login?error=github_oauth_failed`);
  }
});

// ----------------------------------------------------
// GOOGLE OAUTH
// ----------------------------------------------------

// 1. Send the user to Google
router.get('/google', (req, res) => {
  // We use replace to violently strip any invisible carriage returns or spaces that might have snuck in
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').replace(/[\r\n\s]/g, '');
  const redirectUri = 'http://localhost:3000/api/oauth/google/callback';
  // We request email and profile scopes
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=email%20profile&prompt=select_account`;
  res.redirect(googleAuthUrl);
});

// 2. Google sends them back here
router.get('/google/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/login?error=no_code_provided`);
  }

  try {
    // Exchange the code for an access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID?.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: 'http://localhost:3000/api/oauth/google/callback',
      }),
    });

    const tokenData = await tokenResponse.json();
    const googleAccessToken = tokenData.access_token;

    if (!googleAccessToken) {
      throw new Error('Failed to get Google access token');
    }

    // Fetch the user's profile to get their email
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
      },
    });

    const profileData = await profileResponse.json();
    const email = profileData.email;
    const name = profileData.name;

    // Delegate to our helper to create the JWT and redirect to frontend
    await handleOAuthUser(email, name, res);

  } catch (error) {
    console.error('Google OAuth Error:', error);
    res.redirect(`${FRONTEND_URL}/login?error=google_oauth_failed`);
  }
});

module.exports = router;
