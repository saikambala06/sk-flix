'use strict';

/**
 * End-to-end flow test against a real HTTP server with an in-memory data
 * layer standing in for MongoDB. Verifies that a user can sign up, sign in,
 * and that role separation actually holds — the thing that was broken.
 *
 *   node scripts/e2e-test.js
 */

process.env.JWT_SECRET = 'e2e-test-secret';
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'boss@skflip.test';

const path = require('path');
const Module = require('module');
const http = require('http');
const mongoose = require('mongoose');

/* ---- Stub the DB layer -------------------------------------------------- */
const dbPath = require.resolve(path.join(__dirname, '..', 'api', 'lib', 'db.js'));
require.cache[dbPath] = Object.assign(new Module(dbPath, null), {
  exports: { mongoose, connectDB: async () => {}, ensureDB: (q, s, n) => n() },
  loaded: true,
});

/* ---- Minimal in-memory replacements for the models we touch -------------- */
const store = { users: [], movies: [], reviews: [] };
let seq = 0;
const oid = () => (++seq).toString(16).padStart(24, '0');

function chainable(result) {
  const c = {
    select: () => c, sort: () => c, skip: () => c, limit: () => c,
    lean: async () => result, then: (r) => Promise.resolve(result).then(r),
  };
  return c;
}

const modelsPath = require.resolve(path.join(__dirname, '..', 'api', 'lib', 'models.js'));
const models = require(modelsPath);

function makeDoc(data) {
  return {
    ...data,
    save: async function () {
      const i = store.users.findIndex((u) => String(u._id) === String(this._id));
      if (i > -1) store.users[i] = this;
      return this;
    },
  };
}

models.User.findOne = (q) => {
  const found = store.users.find((u) => u.email === q.email);
  const c = chainable(found || null);
  c.select = () => c;
  c.then = (r) => Promise.resolve(found ? makeDoc(found) : null).then(r);
  return c;
};
models.User.findById = (id) => {
  const found = store.users.find((u) => String(u._id) === String(id));
  const c = chainable(found || null);
  c.select = () => c;
  c.then = (r) => Promise.resolve(found ? makeDoc(found) : null).then(r);
  return c;
};
models.User.create = async (data) => {
  if (store.users.some((u) => u.email === data.email)) {
    const e = new Error('dup'); e.code = 11000; throw e;
  }
  const doc = { _id: oid(), tokenVersion: 0, createdAt: new Date(), ...data };
  store.users.push(doc);
  return makeDoc(doc);
};
models.User.estimatedDocumentCount = async () => store.users.length;
models.User.countDocuments = async (q = {}) =>
  store.users.filter((u) => !q.role || u.role === q.role).length;
models.User.find = () => chainable(store.users);

models.Movie.countDocuments = async () => store.movies.length;
models.Movie.find = () => chainable(store.movies);
models.Movie.aggregate = async () => [];
models.Movie.create = async (data) => {
  const doc = { _id: oid(), views: 0, createdAt: new Date(), ...data };
  store.movies.push(doc);
  return doc;
};
models.Movie.findById = (id) => chainable(store.movies.find((m) => String(m._id) === String(id)) || null);
models.Movie.findByIdAndDelete = (id) => {
  const i = store.movies.findIndex((m) => String(m._id) === String(id));
  const doc = i > -1 ? store.movies.splice(i, 1)[0] : null;
  return chainable(doc);
};
models.Review.countDocuments = async () => store.reviews.length;
models.Review.deleteMany = async () => ({});

const app = require(path.join(__dirname, '..', 'api', 'index.js'));
const server = http.createServer(app);

function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host: '127.0.0.1', port: server.address().port, method, path: p,
        headers: { 'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c));
        res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {}
          resolve({ status: res.statusCode, body: j }); }); }
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `  → ${detail}` : ''}`); }
};

(async () => {
  await new Promise((r) => server.listen(0, r));

  console.log('\nSignup and role assignment');
  const admin = await req('POST', '/api/auth/signup', {
    body: { name: 'Boss', email: 'boss@skflip.test', password: 'a-strong-passphrase' },
  });
  check('admin signup succeeds', admin.status === 201, `got ${admin.status}`);
  check('ADMIN_EMAIL gets the admin role', admin.body?.user?.role === 'admin', admin.body?.user?.role);
  check('password never returned', !JSON.stringify(admin.body).includes('passphrase'));

  const viewer = await req('POST', '/api/auth/signup', {
    body: { name: 'Viewer', email: 'viewer@skflip.test', password: 'another-good-one' },
  });
  check('second signup succeeds', viewer.status === 201, `got ${viewer.status}`);
  check('second account is NOT admin', viewer.body?.user?.role === 'user', viewer.body?.user?.role);

  const dupe = await req('POST', '/api/auth/signup', {
    body: { name: 'Copy', email: 'boss@skflip.test', password: 'yet-another-one' },
  });
  check('duplicate email rejected', dupe.status === 409, `got ${dupe.status}`);

  const caseDupe = await req('POST', '/api/auth/signup', {
    body: { name: 'Copy', email: 'BOSS@SkFlip.TEST', password: 'yet-another-one' },
  });
  check('email casing does not create a second account', caseDupe.status === 409, `got ${caseDupe.status}`);

  console.log('\nSign in');
  const login = await req('POST', '/api/auth/login', {
    body: { email: 'boss@skflip.test', password: 'a-strong-passphrase' },
  });
  check('correct credentials sign in', login.status === 200, `got ${login.status}`);
  const adminToken = login.body?.token;

  const badPwd = await req('POST', '/api/auth/login', {
    body: { email: 'boss@skflip.test', password: 'wrong-password-entirely' },
  });
  check('wrong password rejected', badPwd.status === 401, `got ${badPwd.status}`);
  check('error does not reveal that the account exists',
    /not valid/i.test(badPwd.body?.error || ''), badPwd.body?.error);

  console.log('\nRole separation (the bug that was open)');
  const viewerToken = viewer.body?.token;

  const viewerHitsAdmin = await req('GET', '/api/admin/users', { token: viewerToken });
  check('normal user CANNOT list users', viewerHitsAdmin.status === 403, `got ${viewerHitsAdmin.status}`);

  const viewerDeletes = await req('DELETE', `/api/admin/users/${'1'.repeat(24)}`, { token: viewerToken });
  check('normal user CANNOT delete accounts', viewerDeletes.status === 403, `got ${viewerDeletes.status}`);

  const viewerUploads = await req('POST', '/api/admin/movies', {
    token: viewerToken, body: { title: 'Pirated Thing' },
  });
  check('normal user CANNOT add content', viewerUploads.status === 403, `got ${viewerUploads.status}`);
  check('nothing was written', store.movies.length === 0, `${store.movies.length} movies`);

  const adminUploads = await req('POST', '/api/admin/movies', {
    token: adminToken,
    body: { title: 'Test Feature', type: 'movie', videoUrl: 'https://cdn.example.com/a.m3u8' },
  });
  check('admin CAN add content', adminUploads.status === 201, `got ${adminUploads.status}`);

  console.log('\nMass assignment and URL safety');
  const sneaky = await req('POST', '/api/admin/movies', {
    token: adminToken,
    body: { title: 'Sneaky', views: 999999, avgRating: 5, role: 'admin',
            posterUrl: 'javascript:alert(document.cookie)' },
  });
  check('client-supplied view count ignored', sneaky.body?.views === 0, `got ${sneaky.body?.views}`);
  check('javascript: URL stripped', sneaky.body?.posterUrl === '', `got "${sneaky.body?.posterUrl}"`);

  console.log('\nSelf-lockout guards');
  const selfDemote = await req('PUT', `/api/admin/users/${admin.body.user._id}`, {
    token: adminToken, body: { role: 'user' },
  });
  check('admin cannot demote themselves', selfDemote.status === 400, `got ${selfDemote.status}`);

  const selfDelete = await req('DELETE', `/api/admin/users/${admin.body.user._id}`, { token: adminToken });
  check('admin cannot delete themselves', selfDelete.status === 400, `got ${selfDelete.status}`);

  console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
  server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
