// lib/middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Verifies JWT from Authorization: Bearer <token> header.
 * Returns { userId, email, role } or throws.
 */
function verifyToken(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw { status: 401, message: 'No token provided' };

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw { status: 401, message: 'Invalid or expired token' };
  }
}

/**
 * Higher-order handler that requires auth.
 * Usage: export default requireAuth(async (req, res, user) => { ... })
 */
function requireAuth(handler) {
  return async (req, res) => {
    try {
      const user = verifyToken(req);
      return handler(req, res, user);
    } catch (err) {
      return res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
    }
  };
}

/**
 * Requires admin role.
 */
function requireAdmin(handler) {
  return async (req, res) => {
    try {
      const user = verifyToken(req);
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      return handler(req, res, user);
    } catch (err) {
      return res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
    }
  };
}

/**
 * Generate JWT token.
 */
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { verifyToken, requireAuth, requireAdmin, signToken };
