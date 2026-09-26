const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const axios = require('axios');
const router = express.Router();

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

router.get('/concept/:id', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(`${FASTAPI_URL}/learning-paths/concept/${req.params.id}`, { params: { learner_id: req.user.id } });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cluster/:id', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(`${FASTAPI_URL}/learning-paths/cluster/${req.params.id}`, { params: { learner_id: req.user.id } });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
