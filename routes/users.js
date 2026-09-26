const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// 1. GET CURRENT USER PROFILE
router.get('/me', verifyToken, async (req, res) => {
  try {
    // req.user.id is populated by the verifyToken middleware
    const learnerId = req.user.id;

    // Fetch the user, but intentionally exclude password_hash for security
    const result = await db.query(
      'SELECT id, email, name, role, preferred_language, portal_optin, created_at FROM learners WHERE id = $1',
      [learnerId]
    );

    const learner = result.rows[0];

    if (!learner) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(learner);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. UPDATE CURRENT USER PROFILE
router.put('/me', verifyToken, async (req, res) => {
  try {
    const learnerId = req.user.id;
    const { name, preferred_language, portal_optin } = req.body;

    // We only update fields if they were provided in the request body
    // Using COALESCE allows us to keep the existing value if a new one isn't passed
    const result = await db.query(
      `UPDATE learners 
       SET 
         name = COALESCE($1, name),
         preferred_language = COALESCE($2, preferred_language),
         portal_optin = COALESCE($3, portal_optin)
       WHERE id = $4
       RETURNING id, email, name, role, preferred_language, portal_optin, created_at`,
      [name, preferred_language, portal_optin, learnerId]
    );

    const updatedLearner = result.rows[0];

    if (!updatedLearner) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      learner: updatedLearner
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
