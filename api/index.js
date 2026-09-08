'use strict';

const express = require('express');
const cors = require('cors');

const { ensureDB, mongoose } = require('./lib/db');
const { sanitizeBody } = require('./lib/validate');
const { rateLimit } = require('./lib/rateLimit');
const { isMailConfigured } = require('./lib/mailer');

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const storageRoutes = require('./routes/storage');

const app = express();

// Vercel terminates TLS upstream; trust the proxy so req.ip and
// X-Forwarded-For resolve to the real client for rate limiting.
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ------------------------------------------------------------------ */
/*  Security headers                                                  */
/* ------------------------------------------------------------------ */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
});

/* ------------------------------------------------------------------ */
/*  CORS                                                              */
/* ------------------------------------------------------------------ */

// Set ALLOWED_ORIGINS to a comma-separated list in production. The frontend is
// served from the same origin as this API, so browser requests need no CORS at
// all — this exists for a future mobile app or a separate frontend domain.
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests and server-to-server calls send no Origin header.
      if (!origin) return callback(null, true);
      if (!allowed.length) return callback(null, true); // permissive until configured
      if (allowed.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })
);

/* ------------------------------------------------------------------ */
/*  Body parsing + baseline protections                               */
/* ------------------------------------------------------------------ */

// 1 MB is generous for JSON metadata; video never passes through this API.
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeBody);

// Broad ceiling so a single client cannot hammer the whole API.
app.use('/api', rateLimit({ name: 'global', windowMs: 60_000, max: 200 }));

// Health check runs before ensureDB so it can report an outage instead of 503ing.
app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    db: states[mongoose.connection.readyState] || 'unknown',
    mail: isMailConfigured() ? 'configured' : 'not configured',
    storage: require('./lib/r2').isConfigured() ? 'r2 configured' : 'r2 not configured',
    time: new Date().toISOString(),
  });
});

// Everything past this point needs the database.
app.use('/api', ensureDB);

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

app.use('/api/auth', authRoutes);
app.use('/api/admin/storage', storageRoutes); // must precede /api/admin
app.use('/api/admin', adminRoutes);
app.use('/api', contentRoutes); // /home, /movies, /genres, reviews
app.use('/api', userRoutes); // /wishlist, /continue-watching

/* ------------------------------------------------------------------ */
/*  Local development: serve the frontend from the same process        */
/* ------------------------------------------------------------------ */

const RUNNING_LOCALLY = require.main === module;

if (RUNNING_LOCALLY) {
  const path = require('path');
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

/* ------------------------------------------------------------------ */
/*  404 + error handling                                              */
/* ------------------------------------------------------------------ */

app.use('/api', (req, res) => {
  res.status(404).json({ error: `No API route matches ${req.method} ${req.path}.` });
});

// Four arguments — Express only treats this as an error handler with all four.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That request is too large.' });
  }
  if (err?.message === 'Origin not allowed') {
    return res.status(403).json({ error: 'This origin is not allowed to call the API.' });
  }

  console.error('Unhandled error:', err?.message, err?.stack);

  // Internal messages and stack traces stay on the server.
  res.status(500).json({
    error: 'Something went wrong on our end. Try again in a moment.',
    code: 'INTERNAL',
  });
});

module.exports = app;

if (RUNNING_LOCALLY) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`SkFlip running on http://localhost:${port}`);
  });
}
