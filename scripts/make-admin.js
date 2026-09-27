// Promote an existing learner to the 'admin' role (management portal access).
// Usage: node scripts/make-admin.js <email>
// The learner must log in again afterwards: the role is embedded in the access token.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../database/db');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Usage: node scripts/make-admin.js <email>');
    return 1;
  }

  const result = await db.query(
    `UPDATE learners SET role = 'admin'
     WHERE LOWER(email) = $1
     RETURNING id, email, role`,
    [email]
  );

  if (result.rowCount === 0) {
    console.error(`No learner found with email ${email}`);
    return 1;
  }

  const learner = result.rows[0];
  console.log(`Promoted ${learner.email} (id ${learner.id}) to role '${learner.role}'.`);
  console.log('They must log in again to receive an admin access token.');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Failed to promote learner:', err.message);
    process.exit(1);
  });
