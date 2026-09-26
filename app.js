require('dotenv').config();
const express = require('express');
const app = express();

const authRoutes = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const userRoutes = require('./routes/users');
const verifyToken = require('./middleware/auth');

// To allow frontend at localhost:8443 to talk to backend
const cors = require('cors');
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));

app.use(express.json()); // Middleware to parse JSON bodies

// Mount the routes
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notes', require('./routes/notes'));

// Learner Routes
app.use('/api/concepts', require('./routes/concepts'));
app.use('/api/graph', require('./routes/graph'));
app.use('/api/clusters', require('./routes/clusters'));
app.use('/api/review', require('./routes/review'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/learning-paths', require('./routes/learning-paths'));

// Management Routes
app.use('/api/management/overview', require('./routes/management/overview'));
app.use('/api/management/population', require('./routes/management/population'));
app.use('/api/management/grader', require('./routes/management/grader'));
app.use('/api/management/memory', require('./routes/management/memory'));
app.use('/api/management/probes', require('./routes/management/probes'));
app.use('/api/management/graph', require('./routes/management/graph'));
app.use('/api/management/sources', require('./routes/management/sources'));
app.use('/api/management/generation', require('./routes/management/generation'));
app.use('/api/management/clusters', require('./routes/management/clusters'));
app.use('/api/management/evaluation', require('./routes/management/evaluation'));
app.use('/api/management/exports', require('./routes/management/exports'));

// Original test routes
app.get('/', (req, res) => {
  res.send('Hello from Express');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});