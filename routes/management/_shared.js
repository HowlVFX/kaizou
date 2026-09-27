// Shared helpers for the management (portal) routers.
// Not mounted as a router. Privacy floor (D-10): no learner-derived metric is
// surfaced unless at least MIN_LEARNERS distinct learners contributed to it.
const db = require('../../database/db');

const MIN_LEARNERS = 5;

// pg returns COUNT/SUM/numeric as strings; normalise to numbers (or null).
const num = (v) => (v === null || v === undefined ? null : Number(v));

const meetsFloor = (n) => Number(n) >= MIN_LEARNERS;

const ok = (body) => ({ suppressed: false, min_learners: MIN_LEARNERS, ...body });

const suppressed = (reason, extra = {}) => ({
  suppressed: true,
  reason: reason || `Fewer than ${MIN_LEARNERS} learners have contributed data`,
  min_learners: MIN_LEARNERS,
  ...extra,
});

// Returns the value only when its contributing learner count meets the floor.
const gated = (value, nLearners) => (meetsFloor(nLearners) ? num(value) : null);

// Drops grouped rows whose `n_learners` is below the floor and strips the
// learner count from the output. `map` shapes each surviving row.
function floorRows(rows, map) {
  const kept = rows.filter((r) => meetsFloor(r.n_learners));
  return {
    rows: kept.map(map),
    suppressed_groups: rows.length - kept.length,
  };
}

// Latest unsuppressed portal_aggregates row per metric_key with sample_size >= floor.
async function latestAggregates(keys) {
  const result = await db.query(
    `SELECT DISTINCT ON (metric_key)
        metric_key, cohort_key, value, sample_size, window_start, window_end, computed_at
     FROM portal_aggregates
     WHERE metric_key = ANY($1::text[])
       AND suppressed = false
       AND sample_size >= $2
       AND COALESCE(dimensions, '{}'::jsonb) = '{}'::jsonb
     ORDER BY metric_key, computed_at DESC`,
    [keys, MIN_LEARNERS]
  );
  const out = {};
  for (const key of keys) out[key] = null;
  for (const row of result.rows) {
    out[row.metric_key] = {
      value: num(row.value),
      sample_size: row.sample_size,
      cohort_key: row.cohort_key,
      window_start: row.window_start,
      window_end: row.window_end,
      computed_at: row.computed_at,
    };
  }
  return out;
}

// Never leak err.message / SQL details to the client.
function sendError(res, label, err) {
  console.error(`[management/${label}]`, err);
  res.status(500).json({ error: `Failed to load ${label} metrics` });
}

module.exports = {
  MIN_LEARNERS,
  num,
  meetsFloor,
  ok,
  suppressed,
  gated,
  floorRows,
  latestAggregates,
  sendError,
};
