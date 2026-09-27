// Create (or update) an admin account. Admins are a separate identity domain
// from learners — this is the ONLY way to provision one out-of-band.
//
// Usage:
//   node scripts/create-admin.js <email> <password> [--owner] [--name "Full Name"]
//
// Default role is moderator. Pass --owner to create/promote an owner (owners
// are protected from API changes; create them only with this script).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const db = require('../database/db');

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const positional = args.filter((a) => !a.startsWith('--'));
  const email = (positional[0] || '').trim().toLowerCase();
  const password = positional[1] || '';
  const nameIdx = args.indexOf('--name');
  const name = nameIdx >= 0 ? (args[nameIdx + 1] || null) : null;
  const role = flags.has('--owner') ? 'owner' : 'moderator';

  if (!email || !email.includes('@') || password.length < 8) {
    console.error('Usage: node scripts/create-admin.js <email> <password (>=8 chars)> [--owner] [--name "Name"]');
    return 1;
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await db.query(
    `INSERT INTO admins (email, password_hash, name, admin_role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                       name = COALESCE(EXCLUDED.name, admins.name),
                                       admin_role = EXCLUDED.admin_role
     RETURNING id, email, name, admin_role`,
    [email, hash, name && name.slice(0, 100), role],
  );
  const a = result.rows[0];
  console.log(`Admin ready: ${a.email} (id ${a.id}) role '${a.admin_role}'.`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => { console.error('Failed:', err.message); process.exit(1); });
