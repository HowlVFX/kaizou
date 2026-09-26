const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const axios = require('axios');
const router = express.Router();

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

router.get('/queue', verifyToken, async (req, res) => {
  try {
    const response = await axios.get(`${FASTAPI_URL}/review/queue`, { params: { learner_id: req.user.id } });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/answer', verifyToken, async (req, res) => {
  try {
    const response = await axios.post(`${FASTAPI_URL}/review/answer`, req.body, { params: { learner_id: req.user.id } });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
