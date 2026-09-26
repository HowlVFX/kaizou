require('dotenv').config();
const db = require('./database/db');

async function migrate() {
  try {
    console.log("Adding 'name' column to learners...");
    await db.query(`ALTER TABLE learners ADD COLUMN IF NOT EXISTS name VARCHAR(255);`);
    console.log("Name column added/verified.");

    console.log("Creating 'notes' table...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        learner_id INTEGER REFERENCES learners(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        concepts JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Notes table created/verified.");

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
