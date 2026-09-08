'use strict';

/**
 * Lightweight per-instance rate limiter.
 *
 * Serverless caveat: each warm Lambda holds its own counter, so a burst spread
 * across many instances gets a higher effective ceiling than the nominal limit.
 * It still stops the single-client credential-stuffing loop, which is the
 * realistic threat here. For a hard global limit, back this with Redis
 * (Upstash) or turn on Vercel's WAF rules.
 */

const buckets = globalThis.__skflipRateBuckets || (globalThis.__skflipRateBuckets = new Map());

// Drop expired entries so the map cannot grow without bound.
function sweep(now) {
  if (buckets.size < 5000) return;
  for (const [key, entry] of buckets) {
    if (entry.reset < now) buckets.delete(key);
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * @param {object}  opts
 * @param {number}  opts.windowMs  Window length in ms.
 * @param {number}  opts.max       Requests allowed per window.
 * @param {string}  opts.name      Namespace, so two limiters don't share counters.
 * @param {Function} [opts.keyFn]  Custom key (defaults to IP).
 */
function rateLimit({ windowMs = 60_000, max = 30, name = 'default', keyFn } = {}) {
  return function limiter(req, res, next) {
    const now = Date.now();
    sweep(now);

    const id = keyFn ? keyFn(req) : clientIp(req);
    const key = `${name}:${id}`;
    let entry = buckets.get(key);

    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.reset / 1000));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.reset - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: `Too many attempts. Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
        code: 'RATE_LIMITED',
      });
    }

    next();
  };
}

module.exports = { rateLimit, clientIp };
