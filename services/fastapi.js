// Shared Express -> FastAPI client.
//
// Every FastAPI route requires the X-Internal-Key shared secret (FastAPI
// trusts the learner_id we send because only Express holds the key and
// Express takes learner_id from a verified JWT). Use this module for all
// FastAPI calls instead of raw axios so the header is never forgotten.
const axios = require('axios');

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

if (!process.env.INTERNAL_API_KEY) {
  console.warn('[fastapi] INTERNAL_API_KEY is not set; FastAPI will reject every call with 401.');
}

const fastapi = axios.create({
  baseURL: FASTAPI_URL,
  timeout: 180000, // ingestion/grading can take a while (AI calls)
});

fastapi.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  if (process.env.INTERNAL_API_KEY) config.headers['X-Internal-Key'] = process.env.INTERNAL_API_KEY;
  return config;
});

// Pass meaningful FastAPI statuses through to the client instead of a blanket 500.
// 402 = AI budget exhausted, 404 = not found, 422 = bad input, 503 = provider/NLI unavailable.
const PASSTHROUGH = new Set([400, 402, 404, 409, 422, 429, 503]);

function sendFastApiError(res, err, fallbackMessage = 'Upstream service error') {
  const status = err.response && err.response.status;
  const data = err.response && err.response.data;

  if (status && PASSTHROUGH.has(status)) {
    // FastAPI returns {detail: ...} or our own {error, detail}. Keep only safe fields.
    const body = {
      error: (data && data.error) || fallbackMessage,
      detail: data && (typeof data.detail === 'string' ? data.detail : data.detail || undefined),
    };
    if (status === 402 && data) {
      body.spent_inr = data.spent_inr;
      body.cap_inr = data.cap_inr;
    }
    return res.status(status).json(body);
  }

  if (!err.response) {
    console.error('[fastapi] unreachable:', err.code || err.message);
    return res.status(503).json({ error: 'Computation service unavailable' });
  }

  console.error('[fastapi] error', status, data);
  return res.status(502).json({ error: fallbackMessage });
}

module.exports = { fastapi, sendFastApiError, FASTAPI_URL };
