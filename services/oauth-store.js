// Short-lived, single-use server-side values for the OAuth flow:
//   - state:  CSRF token sent to the provider and checked on callback (10 min)
//   - code:   one-time code handed to the frontend in the redirect URL, which
//             it swaps for the real tokens via POST /api/oauth/exchange (60 s)
//
// In-memory only: this works for a single Express instance. Behind a load
// balancer (or across a restart) a login started on one instance can't be
// completed on another; move these to Postgres/Redis if Express is scaled out.
const crypto = require('crypto');

const STATE_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 10000; // bound memory if someone hammers /api/oauth/<provider>

function createStore(ttlMs) {
  const entries = new Map(); // key -> { value, expiresAt }

  function sweep(now = Date.now()) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  }

  const timer = setInterval(sweep, 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    /** Store value under a fresh random key and return the key. */
    put(value) {
      if (entries.size >= MAX_ENTRIES) {
        sweep();
        // Still full: evict the oldest (Maps iterate in insertion order).
        if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value);
      }
      const key = crypto.randomBytes(32).toString('base64url');
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return key;
    },
    /** Return the value and delete it (single use). null if unknown/expired. */
    take(key) {
      if (typeof key !== 'string' || !key) return null;
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      if (entry.expiresAt <= Date.now()) return null;
      return entry.value;
    },
  };
}

const oauthStates = createStore(STATE_TTL_MS);
const loginCodes = createStore(CODE_TTL_MS);

module.exports = { oauthStates, loginCodes, STATE_TTL_MS, CODE_TTL_MS };
