'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Password policy: length is what actually matters. We ask for 8+ characters
 * and reject the handful of passwords that show up in every breach list.
 */
const COMMON = new Set([
  'password', 'password1', '12345678', '123456789', 'qwerty123', '11111111',
  'abc12345', 'iloveyou', 'admin123', 'welcome1', 'letmein1', 'password123',
]);

function passwordProblem(password) {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  if (COMMON.has(password.toLowerCase())) return 'That password is too easy to guess.';
  return null;
}

/**
 * Strip Mongo operators from user input. Without this, a body like
 * { "email": { "$gt": "" } } turns findOne into "return any user".
 */
function sanitize(value, depth = 0) {
  if (depth > 6) return undefined;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Express middleware form of sanitize(). */
function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = sanitize(req.body);
  if (req.query && typeof req.query === 'object') {
    for (const [k, v] of Object.entries(req.query)) {
      if (v && typeof v === 'object') delete req.query[k];
    }
  }
  next();
}

/** Keep only the listed keys — blocks mass assignment via req.body spread. */
function pick(source, keys) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

const MOVIE_FIELDS = [
  'title', 'type', 'releaseYear', 'rating', 'genres', 'description',
  'posterUrl', 'backdropUrl', 'trailerUrl', 'hlsUrl', 'videoUrl', 'duration',
  'episodes', 'episodeCount', 'seasonCount', 'audioLanguages',
  'subtitleLanguages', 'cast', 'director', 'featured', 'isPublished',
];

/**
 * Only allow http(s) media URLs. Blocks javascript: and data: URLs, which
 * would otherwise become stored XSS the moment they hit an href or src.
 */
function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const url = value.trim();
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url;
  return '';
}

const URL_FIELDS = ['posterUrl', 'backdropUrl', 'trailerUrl', 'hlsUrl', 'videoUrl'];

function cleanMoviePayload(body) {
  const data = pick(body, MOVIE_FIELDS);

  for (const field of URL_FIELDS) {
    if (data[field] !== undefined) data[field] = safeUrl(data[field]);
  }

  if (typeof data.genres === 'string') {
    data.genres = data.genres.split(',').map((g) => g.trim()).filter(Boolean);
  }
  if (typeof data.cast === 'string') {
    data.cast = data.cast.split(',').map((c) => c.trim()).filter(Boolean);
  }

  if (Array.isArray(data.episodes)) {
    data.episodes = data.episodes.slice(0, 500).map((ep) => {
      const clean = pick(ep, [
        'season', 'episodeNumber', 'title', 'description',
        'thumbnailUrl', 'videoUrl', 'hlsUrl', 'duration', 'airDate',
      ]);
      for (const f of ['thumbnailUrl', 'videoUrl', 'hlsUrl']) {
        if (clean[f] !== undefined) clean[f] = safeUrl(clean[f]);
      }
      return clean;
    });
  }

  return data;
}

/** 24-character hex string — cheap guard before hitting the database. */
function isObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

module.exports = {
  isEmail,
  normalizeEmail,
  passwordProblem,
  sanitize,
  sanitizeBody,
  pick,
  cleanMoviePayload,
  safeUrl,
  isObjectId,
};
