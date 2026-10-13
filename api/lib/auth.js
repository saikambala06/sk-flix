'use strict';

const jwt = require('jsonwebtoken');
const { User } = require('./models');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

// A guessable signing key means anyone can mint an admin token. In production
// we refuse to start rather than fall back to a hardcoded default.
if (!JWT_SECRET) {
  const msg =
    'JWT_SECRET is not set. Generate one with `openssl rand -base64 48` and add it to your environment variables.';
  if (IS_PROD) throw new Error(msg);
  console.warn('[auth] ' + msg + ' Using an insecure development key.');
}

const SECRET = JWT_SECRET || 'insecure-development-key-do-not-deploy';

function signToken(user) {
  return jwt.sign(
    {
      id: String(user._id),
      role: user.role,
      tv: user.tokenVersion || 0,
    },
    SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function verify(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/** Reject the request unless a valid, non-revoked token is present. */
async function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Sign in to continue.', code: 'NO_TOKEN' });
  }

  const payload = verify(token);
  if (!payload) {
    return res
      .status(401)
      .json({ error: 'Your session has expired. Sign in again.', code: 'BAD_TOKEN' });
  }

  // Confirm the account still exists and the token has not been revoked by a
  // password change. Without this, a stolen token stays valid for its full life.
  const user = await User.findById(payload.id).select('name email role tokenVersion plan').lean();
  if (!user) {
    return res.status(401).json({ error: 'This account no longer exists.', code: 'NO_USER' });
  }
  if ((user.tokenVersion || 0) !== (payload.tv || 0)) {
    return res
      .status(401)
      .json({ error: 'Your session has expired. Sign in again.', code: 'REVOKED' });
  }

  req.user = { id: String(user._id), role: user.role, name: user.name, email: user.email };
  next();
}

/** requireAuth, then check the admin role. Always mount after requireAuth. */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res
      .status(403)
      .json({ error: 'This action requires an administrator account.', code: 'FORBIDDEN' });
  }
  next();
}

/** Attaches req.user when a token is present, but never blocks the request. */
async function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  const payload = verify(token);
  if (!payload) return next();
  try {
    const user = await User.findById(payload.id).select('name email role tokenVersion').lean();
    if (user && (user.tokenVersion || 0) === (payload.tv || 0)) {
      req.user = { id: String(user._id), role: user.role, name: user.name, email: user.email };
    }
  } catch {
    /* non-fatal — continue as a guest */
  }
  next();
}

/** Shape a user document for the client. Never leaks password or reset fields. */
function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan || 'free',
    avatarColor: user.avatarColor || '',
    createdAt: user.createdAt,
  };
}

module.exports = { signToken, requireAuth, requireAdmin, optionalAuth, publicUser };
