const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const router = express.Router();

// Helper function to generate tokens
const generateTokens = (learnerId) => {
  const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_for_development';
  
  // Access Token: Short-lived (e.g., 15 minutes)
  const accessToken = jwt.sign({ id: learnerId }, secret, { expiresIn: '15m' });
  
  // Refresh Token: Long-lived (e.g., 7 days)
  const refreshToken = jwt.sign({ id: learnerId }, secret, { expiresIn: '7d' });
  
  return { accessToken, refreshToken };
};

// 1. SIGNUP ROUTE
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Hash the password before storing it!
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert the new learner into the database
    const result = await db.query(
      'INSERT INTO learners (email, password_hash) VALUES ($1, $2) RETURNING id, email, role',
      [email, passwordHash]
    );

    const newLearner = result.rows[0];

    // Issue tokens immediately upon signup
    const { accessToken, refreshToken } = generateTokens(newLearner.id);

    // Store the refresh token in the database so it can be revoked later
    // Set expiry to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    await db.query(
      'INSERT INTO refresh_tokens (learner_id, token, expires_at) VALUES ($1, $2, $3)',
      [newLearner.id, refreshToken, expiresAt]
    );

    res.status(201).json({
      message: 'Learner registered successfully',
      learner: newLearner,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Signup error:', error);
    // 23505 is the Postgres error code for a unique constraint violation (duplicate email)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

// 2. LOGIN ROUTE
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Fetch the learner from the database
    const result = await db.query('SELECT * FROM learners WHERE email = $1', [email]);
    const learner = result.rows[0];

    if (!learner) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Compare the submitted password with the hashed password
    const passwordMatch = await bcrypt.compare(password, learner.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate new tokens
    const { accessToken, refreshToken } = generateTokens(learner.id);

    // Store the refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    await db.query(
      'INSERT INTO refresh_tokens (learner_id, token, expires_at) VALUES ($1, $2, $3)',
      [learner.id, refreshToken, expiresAt]
    );

    res.json({
      message: 'Login successful',
      learner: {
        id: learner.id,
        email: learner.email,
        role: learner.role
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

module.exports = router;
