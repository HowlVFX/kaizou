const express = require('express');
const verifyToken = require('../middleware/auth');
const { fastapi, sendFastApiError } = require('../services/fastapi');
const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// learner_id always comes from the verified JWT, never from the client.
router.get('/concept/:id', verifyToken, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Concept not found' });
  try {
    const response = await fastapi.get(`/learning-paths/concept/${req.params.id}`, { params: { learner_id: req.user.id } });
    res.json(response.data);
  } catch (err) {
    sendFastApiError(res, err, 'Failed to load learning path');
  }
});

router.get('/cluster/:id', verifyToken, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Cluster not found' });
  try {
    const response = await fastapi.get(`/learning-paths/cluster/${req.params.id}`, { params: { learner_id: req.user.id } });
    res.json(response.data);
  } catch (err) {
    sendFastApiError(res, err, 'Failed to load learning path');
  }
});

module.exports = router;
