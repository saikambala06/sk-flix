'use strict';

/**
 * Frontend/backend contract test.
 *
 * Extracts every API call the client makes from index.html, extracts every
 * route the Express app actually mounts, and checks each call resolves.
 *
 * This exists because three admin calls kept pointing at /api/movies after
 * those routes moved to /api/admin/movies. Everything compiled, every unit
 * test passed, and the failure only appeared when someone pressed Save.
 *
 *   node scripts/test-api-contract.js
 */

process.env.JWT_SECRET = 'contract-test-secret';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const mongoose = require('mongoose');

/* ---- Load the app without a database ------------------------------------ */
const dbPath = require.resolve(path.join(__dirname, '..', 'api', 'lib', 'db.js'));
require.cache[dbPath] = Object.assign(new Module(dbPath, null), {
  exports: { mongoose, connectDB: async () => {}, ensureDB: (q, s, n) => n() },
  loaded: true,
});
const app = require(path.join(__dirname, '..', 'api', 'index.js'));

/* ---- Collect mounted routes --------------------------------------------- */
function collectRoutes(stack, prefix = '') {
  const found = [];
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      found.push({ path: prefix + layer.route.path, methods });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // Recover the mount path from the layer's regexp. Express 4 produces
      // sources shaped like  ^\/api\/auth\/?(?=\/|$)
      let mount = '';
      const source = layer.regexp && layer.regexp.source;
      if (source) {
        mount = source
          .replace(/^\^/, '')             // leading anchor
          .replace(/\(\?=[^)]*\)/g, '')    // lookahead tail
          .replace(/\\\//g, '/')          // unescape slashes
          .replace(/\/\?$/, '')           // optional trailing slash
          .replace(/\$$/, '');
        if (mount === '/' || mount === '') mount = '';
        else if (!mount.startsWith('/')) mount = '/' + mount;
      }
      found.push(...collectRoutes(layer.handle.stack, prefix + mount));
    }
  }
  return found;
}

const routes = collectRoutes(app._router.stack);

/** Does a concrete path match a route pattern with :params? */
function routeMatches(pattern, actual) {
  const p = pattern.split('/').filter(Boolean);
  const a = actual.split('/').filter(Boolean);
  if (p.length !== a.length) return false;
  return p.every((seg, i) => seg.startsWith(':') || seg === a[i]);
}

function isMounted(method, urlPath) {
  return routes.some(
    (r) => r.methods.includes(method) && routeMatches(r.path, urlPath)
  );
}

/* ---- Extract the calls the frontend makes -------------------------------- */
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const js = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');

const calls = [];

// api('/path', {method:'POST'})  and  api(`/path/${x}`, {...})
const apiCall = /\bapi\(\s*(['"`])([^'"`]+)\1([\s\S]{0,160}?)\)/g;
let m;
while ((m = apiCall.exec(js)) !== null) {
  const rawPath = m[2];
  const tail = m[3];
  const methodMatch = tail.match(/method\s*:\s*['"](\w+)['"]/);
  const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
  calls.push({ raw: rawPath, tail, method, line: js.slice(0, m.index).split('\n').length });
}

// Direct fetch(API + `/path`, {method:'POST'})
const fetchCall = /fetch\(\s*API\s*\+\s*[`'"]([^`'"]+)[`'"]([\s\S]{0,120}?)\)/g;
while ((m = fetchCall.exec(js)) !== null) {
  const methodMatch = m[2].match(/method\s*:\s*['"](\w+)['"]/);
  calls.push({
    raw: m[1],
    method: methodMatch ? methodMatch[1].toUpperCase() : 'GET',
    line: js.slice(0, m.index).split('\n').length,
  });
}

/**
 * Turn a client path into something comparable with a route pattern.
 * Handles the two ways the client builds dynamic paths:
 *   api(`/movies/${id}/reviews`)   → /movies/:param/reviews
 *   api('/admin/movies/' + id)     → /admin/movies/:param
 */
function normalize(raw, tail = '') {
  let p = raw.split('?')[0];
  p = p.replace(/\$\{[^}]*\}/g, ':param');   // template interpolation

  // A literal ending in "/" followed by concatenation means the next segment
  // is a parameter. Without this, '/admin/movies/' + id reads as a collection
  // path and wrongly reports the route as missing.
  if (p.endsWith('/') && /^\s*\+/.test(tail)) {
    p = p.slice(0, -1) + '/:param';
  } else {
    p = p.replace(/\/+$/, '');
  }
  return p.startsWith('/') ? p : '/' + p;
}

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `  → ${detail}` : ''}`); }
};

console.log(`\nMounted routes: ${routes.length}`);
console.log(`Frontend API calls found: ${calls.length}\n`);

// Deduplicate so one broken endpoint used twice reports once.
const seen = new Set();
const unique = [];
for (const c of calls) {
  const key = `${c.method} ${normalize(c.raw, c.tail || '')}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push({ ...c, normalized: normalize(c.raw, c.tail || '') });
}

console.log('Every client call resolves to a mounted route');
for (const c of unique.sort((a, b) => a.normalized.localeCompare(b.normalized))) {
  const full = '/api' + c.normalized;
  check(`${c.method} ${full}`, isMounted(c.method, full), `index.html line ~${c.line}`);
}

// Guard the specific regression: admin writes must not sit on public paths.
console.log('\nAdmin writes are not on public paths');
for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
  const leaked = unique.filter(
    (c) => c.method === method && /^\/movies(\/|$)/.test(c.normalized) && !/reviews|view/.test(c.normalized)
  );
  check(`no ${method} against /api/movies`, leaked.length === 0,
    leaked.map((l) => l.normalized).join(', '));
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
