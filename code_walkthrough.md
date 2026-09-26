# Auth Code Walkthrough

Since you're taking a learning-first approach, here is a complete, line-by-line breakdown of exactly what we built for the authentication system. 

You can click the arrows below to cycle through each file.

````carousel
### 1. Environment Variables ([`.env`](file:///c:/second_brain/.env))

```env
DATABASE_URL="postgresql://..."
JWT_SECRET=super_secret_jwt_key_for_development
```

- **`DATABASE_URL`**: This is the connection string pointing to your Neon database. When we set up the `pg` library, it automatically looks for a variable exactly named `DATABASE_URL` in the environment to know where to connect.
- **`JWT_SECRET`**: This is a private "password" used by the `jsonwebtoken` library. When a user logs in, the library uses this secret string to cryptographically sign their token. If a hacker tries to forge a token, it will be rejected because they don't have this secret to sign it with.

<!-- slide -->
### 2. Database Connection ([`database/db.js`](file:///c:/second_brain/database/db.js))

```javascript
const { Pool } = require('pg');
```
- Imports the `Pool` class from the `pg` (Postgres) library.

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } 
});
```
- Creates a new Connection Pool. A "pool" is a smart manager that keeps several connections open to your database at all times. If 10 users hit your server at once, it hands out 10 open connections instead of wasting time opening 10 new ones.
- `connectionString`: Grabs the URL from your `.env` file.
- `ssl`: Cloud databases like Neon require encrypted (SSL) connections.

```javascript
module.exports = {
  query: (text, params) => pool.query(text, params),
};
```
- We don't export the whole `pool`. We only export a single `query` function. This is a best practice that ensures everywhere in your app uses the same pool to run SQL commands safely.

<!-- slide -->
### 3. Database Schema ([`database/schema.sql`](file:///c:/second_brain/database/schema.sql))

```sql
CREATE TABLE IF NOT EXISTS learners (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
```
- **`id SERIAL PRIMARY KEY`**: Automatically creates a unique integer ID (1, 2, 3...) for each user.
- **`email UNIQUE NOT NULL`**: Ensures no two users can sign up with the same email.
- **`password_hash`**: We NEVER store plain text passwords. We only store the "hashed" gibberish version here.

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER REFERENCES learners(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
```
- **`REFERENCES learners(id) ON DELETE CASCADE`**: This tells Postgres that this token belongs to a specific learner. The `ON DELETE CASCADE` part is magic: if you delete a user from the `learners` table, Postgres will automatically delete all their tokens from this table too!

<!-- slide -->
### 4. JWT Middleware ([`middleware/auth.js`](file:///c:/second_brain/middleware/auth.js))

This file acts as a "bouncer" for protected routes.

```javascript
const authHeader = req.headers['authorization'];
const token = authHeader.split(' ')[1];
```
- When a logged-in frontend makes a request, it sends a header that looks like this: `Authorization: Bearer <the-jwt-token>`. These two lines grab that header and split it by the space character to extract just the token part.

```javascript
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```
- This is where the security happens. `jwt.verify` takes the token and checks it against your `JWT_SECRET`. If it is expired, or if someone tampered with the data inside it, this function will instantly throw an error.

```javascript
req.user = decoded;
next();
```
- If the token is valid, it decodes the payload (which contains the `{ id: learnerId }`). We attach that to `req.user` so the rest of your code knows exactly who is making the request.
- `next()` tells Express: "This request passed the security check, pass it along to the actual route handler now."

<!-- slide -->
### 5. Authentication Routes ([`routes/auth.js`](file:///c:/second_brain/routes/auth.js))

**The Signup Route:**
```javascript
const passwordHash = await bcrypt.hash(password, saltRounds);
```
- Takes the plain text password and runs it through the `bcrypt` algorithm 10 times (`saltRounds`) to generate an irreversible hash.

```javascript
const result = await db.query(
  'INSERT INTO learners (email, password_hash) VALUES ($1, $2) RETURNING id',
  [email, passwordHash]
);
```
- Inserts the new user. The `$1` and `$2` are called "parameterized queries". We use these instead of injecting strings directly to prevent SQL Injection attacks. `RETURNING id` tells Postgres to immediately hand us back the new user's ID so we can generate their tokens.

**The Login Route:**
```javascript
const passwordMatch = await bcrypt.compare(password, learner.password_hash);
```
- When logging in, we fetch the user by email, and use `bcrypt.compare`. It takes the plain text password they just typed in, runs the same math on it, and checks if it results in the exact same hash stored in the database.

<!-- slide -->
### 6. The Main App ([`app.js`](file:///c:/second_brain/app.js))

```javascript
require('dotenv').config();
```
- This must be the very first line of your app. It looks at the `.env` file and loads all the variables into the system's `process.env` so the rest of your app can see the Database URL and JWT Secret.

```javascript
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
```
- We import the massive `routes/auth.js` file and mount it to `/api/auth`. This means that if a route inside that file is defined as `router.post('/login')`, it will be accessible at `http://localhost:3000/api/auth/login`. This keeps `app.js` incredibly clean no matter how big your project gets.
````
