'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { User } = require('../lib/models');
const { signToken, requireAuth, publicUser } = require('../lib/auth');
const { rateLimit } = require('../lib/rateLimit');
const { isEmail, normalizeEmail, passwordProblem } = require('../lib/validate');
const { sendResetCode, isMailConfigured } = require('../lib/mailer');

const router = express.Router();

const BCRYPT_ROUNDS = 10;
const RESET_TTL_MS = 10 * 60 * 1000;
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

// The very first account can self-promote to admin only if no ADMIN_EMAIL is
// configured. Setting ADMIN_EMAIL is the recommended production path.
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || '');

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/** Constant-time compare so response timing can't be used to guess the code. */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ------------------------------------------------------------------ */
/*  Sign up                                                           */
/* ------------------------------------------------------------------ */

router.post(
  '/signup',
  rateLimit({ name: 'signup', windowMs: 60 * 60 * 1000, max: 10 }),
  async (req, res, next) => {
    try {
      const name = String(req.body.name || '').trim();
      const email = normalizeEmail(req.body.email);
      const password = req.body.password;

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Enter your name, email and a password.' });
      }
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ error: 'Your name should be 2 to 60 characters.' });
      }
      if (!isEmail(email)) {
        return res.status(400).json({ error: 'That email address does not look right.' });
      }
      const pwdIssue = passwordProblem(password);
      if (pwdIssue) return res.status(400).json({ error: pwdIssue });

      const existing = await User.findOne({ email }).lean();
      if (existing) {
        return res.status(409).json({ error: 'An account already uses that email. Sign in instead.' });
      }

      const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

      let role = 'user';
      if (ADMIN_EMAIL) {
        if (email === ADMIN_EMAIL) role = 'admin';
      } else if ((await User.estimatedDocumentCount()) === 0) {
        role = 'admin';
      }

      const user = await User.create({
        name,
        email,
        password: hashed,
        role,
        lastLoginAt: new Date(),
      });

      res.status(201).json({ token: signToken(user), user: publicUser(user) });
    } catch (err) {
      // Race between the findOne check and create — the unique index catches it.
      if (err.code === 11000) {
        return res.status(409).json({ error: 'An account already uses that email. Sign in instead.' });
      }
      next(err);
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Sign in                                                           */
/* ------------------------------------------------------------------ */

router.post(
  '/login',
  rateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: 12 }),
  async (req, res, next) => {
    try {
      // Type-check before anything else: sanitizeBody strips Mongo operators,
      // but an object body would still reach findOne and waste a query.
      if (typeof req.body.email !== 'string' || typeof req.body.password !== 'string') {
        return res.status(400).json({ error: 'Enter your email and password.' });
      }

      const email = normalizeEmail(req.body.email);
      const password = req.body.password;

      if (!email || !password) {
        return res.status(400).json({ error: 'Enter your email and password.' });
      }

      const user = await User.findOne({ email }).select('+password');

      // Same message and comparable timing whether the email exists or not,
      // so this endpoint can't be used to enumerate registered accounts.
      const stored = user
        ? user.password
        : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
      const ok = await bcrypt.compare(password, stored);

      if (!user || !ok) {
        return res.status(401).json({ error: 'That email and password combination is not valid.' });
      }

      user.lastLoginAt = new Date();
      await user.save();

      res.json({ token: signToken(user), user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Current session                                                   */
/* ------------------------------------------------------------------ */

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: 'This account no longer exists.' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const update = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ error: 'Your name should be 2 to 60 characters.' });
      }
      update.name = name;
    }
    if (req.body.avatarColor !== undefined) {
      const color = String(req.body.avatarColor).trim();
      update.avatarColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '';
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).lean();
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/password',
  requireAuth,
  rateLimit({ name: 'pwdchange', windowMs: 15 * 60 * 1000, max: 8 }),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const issue = passwordProblem(newPassword);
      if (issue) return res.status(400).json({ error: issue });

      const user = await User.findById(req.user.id).select('+password');
      if (!user) return res.status(404).json({ error: 'This account no longer exists.' });

      const ok = await bcrypt.compare(String(currentPassword || ''), user.password);
      if (!ok) return res.status(401).json({ error: 'Your current password is not correct.' });

      user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      user.tokenVersion = (user.tokenVersion || 0) + 1; // sign out other devices
      await user.save();

      // Issue a fresh token so the current device stays signed in.
      res.json({ message: 'Password changed.', token: signToken(user) });
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Password reset                                                    */
/* ------------------------------------------------------------------ */

const GENERIC_RESET_MESSAGE =
  'If an account exists for that email, a code is on its way.';

router.post(
  '/forgot-password',
  rateLimit({ name: 'forgot', windowMs: 15 * 60 * 1000, max: 6 }),
  async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email);
      if (!isEmail(email)) {
        return res.status(400).json({ error: 'That email address does not look right.' });
      }
      if (!isMailConfigured()) {
        return res.status(503).json({
          error: 'Password reset email is not set up on this server yet.',
          code: 'MAIL_NOT_CONFIGURED',
        });
      }

      const user = await User.findOne({ email }).select('+resetLastSentAt +resetCodeHash');

      // Reply identically for unknown addresses so the endpoint reveals nothing.
      if (!user) return res.json({ message: GENERIC_RESET_MESSAGE });

      if (
        user.resetLastSentAt &&
        Date.now() - new Date(user.resetLastSentAt).getTime() < RESET_RESEND_COOLDOWN_MS
      ) {
        return res.status(429).json({ error: 'A code was just sent. Wait a minute before asking for another.' });
      }

      const code = generateCode();
      user.resetCodeHash = hashCode(code);
      user.resetCodeExpiry = new Date(Date.now() + RESET_TTL_MS);
      user.resetAttempts = 0;
      user.resetLastSentAt = new Date();
      await user.save();

      try {
        await sendResetCode(user.email, code, user.name);
      } catch (mailErr) {
        console.error('Reset email failed:', mailErr.message);
        return res.status(502).json({ error: 'The code could not be sent. Try again in a moment.' });
      }

      res.json({ message: GENERIC_RESET_MESSAGE });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/reset-password',
  rateLimit({ name: 'reset', windowMs: 15 * 60 * 1000, max: 10 }),
  async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email);
      const code = String(req.body.code || '').trim();
      const newPassword = req.body.newPassword;

      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Enter your email, the code and a new password.' });
      }
      const issue = passwordProblem(newPassword);
      if (issue) return res.status(400).json({ error: issue });

      const user = await User.findOne({ email }).select(
        '+resetCodeHash +resetCodeExpiry +resetAttempts +password'
      );

      const invalid = { error: 'That code is not valid or has expired. Request a new one.' };
      if (!user || !user.resetCodeHash || !user.resetCodeExpiry) {
        return res.status(400).json(invalid);
      }
      if (user.resetCodeExpiry < new Date()) {
        return res.status(400).json(invalid);
      }
      if ((user.resetAttempts || 0) >= RESET_MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Too many wrong codes. Request a new one.' });
      }

      if (!timingSafeEqual(hashCode(code), user.resetCodeHash)) {
        user.resetAttempts = (user.resetAttempts || 0) + 1;
        await user.save();
        return res.status(400).json(invalid);
      }

      user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      user.resetCodeHash = undefined;
      user.resetCodeExpiry = undefined;
      user.resetAttempts = 0;
      user.tokenVersion = (user.tokenVersion || 0) + 1; // invalidate old sessions
      await user.save();

      res.json({ message: 'Password reset. Sign in with your new password.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
