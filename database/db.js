const { Pool } = require('pg');

// TLS: certificates are verified by default (Neon uses publicly trusted
// certs). Set DB_SSL_REJECT_UNAUTHORIZED=false only for a local/self-signed
// database. `sslmode=disable` in DATABASE_URL turns TLS off entirely.
//
// pg merges query-string options from the connection string OVER the `ssl`
// object passed here, so sslmode is stripped from the URL and translated into
// an explicit `ssl` config; otherwise the env opt-out would be silently ignored.
function buildConfig(rawUrl) {
  const rejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
  let connectionString = rawUrl;
  let sslmode = null;
  try {
    const url = new URL(rawUrl);
    sslmode = url.searchParams.get('sslmode');
    url.searchParams.delete('sslmode');
    connectionString = url.toString();
  } catch {
    // Not a parseable URL (or unset); hand it to pg unchanged.
  }
  const ssl = sslmode === 'disable' ? false : { rejectUnauthorized };
  return { connectionString, ssl };
}

// A "pool" manages multiple connections to Postgres efficiently so we don't
// have to open and close a connection manually on every request.
const pool = new Pool(buildConfig(process.env.DATABASE_URL));

// An idle client erroring (e.g. Neon closing an idle connection) emits on the
// pool; without a listener that would crash the process.
pool.on('error', (err) => {
  console.error('[db] idle client error:', err.code || err.message);
});

// We export a simple query method that we will use in all our route handlers.
module.exports = {
  query: (text, params) => pool.query(text, params),
};
