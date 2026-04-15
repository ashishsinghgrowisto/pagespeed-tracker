const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-prod';

/**
 * Extracts and verifies the JWT from the request's Authorization header.
 * Works with Vercel's req object (req.headers.authorization).
 * Returns the decoded payload on success, null on failure.
 */
function verifyToken(req) {
  const auth =
    (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function generateToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '24h' });
}

module.exports = { verifyToken, generateToken };
