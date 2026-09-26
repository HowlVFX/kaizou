const jwt = require('jsonwebtoken');

// Middleware to protect routes that require a user to be logged in
function verifyToken(req, res, next) {
  // 1. Get the token from the "Authorization" header
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Access Denied. No token provided.' });
  }

  // Tokens are usually sent as "Bearer <token>"
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access Denied. Invalid token format.' });
  }

  try {
    // 2. Verify the token using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_for_development');
    
    // 3. Attach the decoded user payload to the request object
    req.user = decoded;
    
    // 4. Move to the next middleware or route handler
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = verifyToken;
