// Recall probability, mirroring fastapi/app/memory/decay.py:
//   R(dt) = 2^(-dt_days / half_life_days)
// half_life is stored in DAYS (memory_states.half_life). R is computed on
// read; nothing stores it.
//
// Differences from the Python helper, on purpose for display:
//   - never reviewed (no memory state / last_reviewed NULL) -> null, not 1.0,
//     so the UI can render "not yet reviewed" instead of a false 100%.
//   - decay_exempt -> 1.0 (mastery pin), same as Python.

// Graph colour bands from decay.py: >= 0.75 green, >= 0.50 amber, else red.
const RECALL_STRONG = 0.75;
const RECALL_FADING = 0.5;

function computeRecall(lastReviewed, halfLifeDays, decayExempt = false, now = Date.now()) {
  if (decayExempt) return 1.0;
  if (!lastReviewed) return null;
  const reviewedMs = new Date(lastReviewed).getTime();
  if (Number.isNaN(reviewedMs)) return null;
  const deltaDays = (now - reviewedMs) / 86400000;
  if (deltaDays <= 0) return 1.0;
  const h = Number(halfLifeDays);
  if (!Number.isFinite(h) || h <= 0) return 0.0;
  return Math.pow(2, -deltaDays / h);
}

module.exports = { computeRecall, RECALL_STRONG, RECALL_FADING };
