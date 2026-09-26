const { Pool } = require('pg');

// Create a new connection pool using the DATABASE_URL from our .env file.
// A "pool" manages multiple connections to Postgres efficiently so we don't
// have to open and close a connection manually on every request.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required by cloud providers like Neon/Supabase
  }
});

// We export a simple query method that we will use in all our route handlers.
module.exports = {
  query: (text, params) => pool.query(text, params),
};
