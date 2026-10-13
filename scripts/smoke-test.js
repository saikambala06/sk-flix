'use strict';

/**
 * Route-level smoke test. Stubs the database so it can run anywhere, then
 * proves the routing and auth layer behave. The point of this file is the
 * admin section: those endpoints used to answer 200 to anyone.
 *
 *   node scripts/smoke-test.js
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-secret-not-for-production';
process.env.NODE_ENV = 'test';

const path = require('path');
const Module = require('module');

// --- Stub the db module so no real Mongo connection is needed --------------
const dbPath = require.resolve(path.join(__dirname, '..', 'api', 'lib', 'db.js'));
const mongoose = require('mongoose');
require.cache[dbPath] = new Module(dbPath, null);
require.cache[dbPath].exports = {
  mongoose,
  connectDB: async () => {},
  ensureDB: (req, res, next) => next(),
};
require.cache[dbPath].loaded = true;

// --- Stub User.findById so requireAuth can run without a database ----------
const modelsPath = require.resolve(path.join(__dirname, '..', 'api', 'lib', 'models.js'));
const realModels = require(modelsPath);
realModels.User.findById = () => ({
  select: () => ({ lean: async () => null }), // "no such user" — enough for auth tests
});

const app = require(path.join(__dirname, '..', 'api', 'index.js'));

const http = require('http');
const server = http.createServer(app);

function request(method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: server.address().port,
        method,
        path: urlPath,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch { /* non-JSON body */ }
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `  → ${detail}` : ''}`);
  }
}

(async () => {
  await new Promise((r) => server.listen(0, r));

  console.log('\nHealth and headers');
  const health = await request('GET', '/api/health');
  check('GET /api/health returns 200', health.status === 200, `got ${health.status}`);
  check('sets X-Content-Type-Options', health.headers['x-content-type-options'] === 'nosniff');
  check('sets X-Frame-Options', health.headers['x-frame-options'] === 'DENY');
  check('hides X-Powered-By', !health.headers['x-powered-by']);

  console.log('\nAdmin routes reject anonymous callers');
  const adminRoutes = [
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/movies'],
    ['POST', '/api/admin/movies'],
    ['PUT', '/api/admin/movies/507f1f77bcf86cd799439011'],
    ['DELETE', '/api/admin/movies/507f1f77bcf86cd799439011'],
    ['PUT', '/api/admin/users/507f1f77bcf86cd799439011'],
    ['DELETE', '/api/admin/users/507f1f77bcf86cd799439011'],
    // Storage signing must be admin-only: a leaked presigned PUT lets anyone
    // write arbitrary objects into the bucket.
    ['GET', '/api/admin/storage/status'],
    ['POST', '/api/admin/storage/upload-url'],
    ['POST', '/api/admin/storage/multipart/create'],
    ['POST', '/api/admin/storage/multipart/sign'],
    ['POST', '/api/admin/storage/multipart/complete'],
    ['DELETE', '/api/admin/storage/object'],
  ];
  for (const [method, route] of adminRoutes) {
    const res = await request(method, route, { body: {} });
    check(`${method} ${route} → 401`, res.status === 401, `got ${res.status}`);
  }

  console.log('\nAdmin routes reject a forged token');
  const forged = require('jsonwebtoken').sign(
    { id: '507f1f77bcf86cd799439011', role: 'admin', tv: 0 },
    'the-wrong-signing-key'
  );
  const forgedRes = await request('GET', '/api/admin/users', { token: forged });
  check('token signed with the wrong key → 401', forgedRes.status === 401, `got ${forgedRes.status}`);

  console.log('\nUser routes require a session');
  for (const [method, route] of [
    ['GET', '/api/wishlist'],
    ['GET', '/api/continue-watching'],
    ['POST', '/api/wishlist/toggle/507f1f77bcf86cd799439011'],
    ['GET', '/api/auth/me'],
  ]) {
    const res = await request(method, route, { body: {} });
    check(`${method} ${route} → 401`, res.status === 401, `got ${res.status}`);
  }

  console.log('\nInput validation');
  const badId = await request('GET', '/api/movies/not-an-id');
  check('malformed id → 400 not 500', badId.status === 400, `got ${badId.status}`);

  const shortPwd = await request('POST', '/api/auth/signup', {
    body: { name: 'Test', email: 'test@example.com', password: '123' },
  });
  check('weak password rejected', shortPwd.status === 400, `got ${shortPwd.status}`);

  const badEmail = await request('POST', '/api/auth/signup', {
    body: { name: 'Test', email: 'nope', password: 'a-good-long-password' },
  });
  check('malformed email rejected', badEmail.status === 400, `got ${badEmail.status}`);

  const injection = await request('POST', '/api/auth/login', {
    body: { email: { $gt: '' }, password: { $gt: '' } },
  });
  check(
    'NoSQL operator payload does not authenticate',
    injection.status === 400 || injection.status === 401,
    `got ${injection.status}`
  );

  console.log('\nUnknown routes');
  const notFound = await request('GET', '/api/definitely-not-a-route');
  check('unknown API path → 404', notFound.status === 404, `got ${notFound.status}`);

  console.log('\nRate limiting');
  let limited = false;
  for (let i = 0; i < 20; i++) {
    const res = await request('POST', '/api/auth/login', {
      body: { email: `x${i}@example.com`, password: 'wrong-password-here' },
    });
    if (res.status === 429) { limited = true; break; }
  }
  check('repeated login attempts get throttled', limited);

  console.log(
    `\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m\n`
  );

  server.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
