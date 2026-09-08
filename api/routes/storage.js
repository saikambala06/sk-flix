'use strict';

/**
 * Storage routes. Admin-only — the whole router sits behind requireAuth and
 * requireAdmin, so a presigned upload URL can never be minted by a viewer.
 *
 * The bytes never touch this server. Each endpoint returns a signature the
 * browser uses to talk to R2 directly, which is both far faster and the only
 * option available: Vercel caps a serverless request body at 4.5 MB.
 */

const express = require('express');
const r2 = require('../lib/r2');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { rateLimit } = require('../lib/rateLimit');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Signing is cheap, but an unbounded loop could still mint thousands of URLs.
router.use(rateLimit({ name: 'storage', windowMs: 60_000, max: 120 }));

// Fail clearly when the credentials are missing rather than throwing a 500.
router.use((req, res, next) => {
  if (!r2.isConfigured()) {
    return res.status(503).json({
      error: 'R2 storage is not configured. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET to your environment.',
      code: 'R2_NOT_CONFIGURED',
    });
  }
  next();
});

const MAX_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB ceiling per object

/* ------------------------------------------------------------------ */
/*  Status                                                            */
/* ------------------------------------------------------------------ */

router.get('/status', (req, res) => {
  res.json({
    configured: true,
    publicBase: r2.PUBLIC_BASE || null,
    privatePlayback: r2.PRIVATE_PLAYBACK,
    // Without a public base and with signing off, uploads would succeed but
    // produce no playable URL. Surface that before anyone uploads 2 GB.
    ready: Boolean(r2.PUBLIC_BASE || r2.PRIVATE_PLAYBACK),
  });
});

/* ------------------------------------------------------------------ */
/*  Single-request upload                                             */
/* ------------------------------------------------------------------ */

router.post('/upload-url', async (req, res, next) => {
  try {
    const { filename, contentType, prefix } = req.body;
    if (!filename) return res.status(400).json({ error: 'A filename is required.' });

    const size = Number(req.body.size) || 0;
    if (size > MAX_BYTES) {
      return res.status(400).json({ error: 'That file is larger than the 20 GB limit.' });
    }

    const safePrefix = ['video', 'poster', 'subtitle', 'hls'].includes(prefix) ? prefix : 'video';
    const key = r2.buildKey(filename, safePrefix);
    const url = await r2.presignUpload(key, { contentType });

    res.json({ key, url, playbackUrl: await r2.playbackUrl(key), expiresIn: 3600 });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  Multipart upload                                                  */
/* ------------------------------------------------------------------ */

router.post('/multipart/create', async (req, res, next) => {
  try {
    const { filename, contentType, prefix } = req.body;
    if (!filename) return res.status(400).json({ error: 'A filename is required.' });

    const size = Number(req.body.size) || 0;
    if (size > MAX_BYTES) {
      return res.status(400).json({ error: 'That file is larger than the 20 GB limit.' });
    }

    const safePrefix = ['video', 'poster', 'subtitle', 'hls'].includes(prefix) ? prefix : 'video';
    const key = r2.buildKey(filename, safePrefix);
    const uploadId = await r2.createMultipart(key, contentType);

    res.json({ key, uploadId });
  } catch (err) {
    next(err);
  }
});

router.post('/multipart/sign', async (req, res, next) => {
  try {
    const { key, uploadId } = req.body;
    const partNumbers = req.body.partNumbers;

    if (!r2.isValidKey(key) || !uploadId) {
      return res.status(400).json({ error: 'A valid key and uploadId are required.' });
    }
    if (!Array.isArray(partNumbers) || !partNumbers.length) {
      return res.status(400).json({ error: 'partNumbers must be a non-empty array.' });
    }
    // Sign in batches so one request covers several parts without letting a
    // caller ask for ten thousand signatures at once.
    if (partNumbers.length > 100) {
      return res.status(400).json({ error: 'Request at most 100 part signatures at a time.' });
    }

    const urls = {};
    await Promise.all(
      partNumbers.map(async (n) => {
        const part = parseInt(n, 10);
        if (!(part >= 1 && part <= 10000)) return;
        urls[part] = await r2.presignPart(key, uploadId, part);
      })
    );

    res.json({ urls });
  } catch (err) {
    next(err);
  }
});

router.post('/multipart/complete', async (req, res, next) => {
  try {
    const { key, uploadId, parts } = req.body;
    if (!r2.isValidKey(key) || !uploadId) {
      return res.status(400).json({ error: 'A valid key and uploadId are required.' });
    }
    if (!Array.isArray(parts) || !parts.length) {
      return res.status(400).json({ error: 'parts must be a non-empty array.' });
    }

    const clean = parts
      .map((p) => ({ PartNumber: parseInt(p.PartNumber ?? p.partNumber, 10), ETag: p.ETag ?? p.etag }))
      .filter((p) => p.PartNumber >= 1 && p.ETag);

    if (clean.length !== parts.length) {
      return res.status(400).json({ error: 'Every part needs a PartNumber and an ETag.' });
    }

    await r2.completeMultipart(key, uploadId, clean);
    res.json({ key, playbackUrl: await r2.playbackUrl(key) });
  } catch (err) {
    next(err);
  }
});

router.post('/multipart/abort', async (req, res, next) => {
  try {
    const { key, uploadId } = req.body;
    if (!r2.isValidKey(key) || !uploadId) {
      return res.status(400).json({ error: 'A valid key and uploadId are required.' });
    }
    await r2.abortMultipart(key, uploadId);
    res.json({ message: 'Upload cancelled.' });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  Management                                                        */
/* ------------------------------------------------------------------ */

router.get('/objects', async (req, res, next) => {
  try {
    const prefix = String(req.query.prefix || '').slice(0, 200);
    const objects = await r2.listObjects(prefix, 200);
    res.json({ objects });
  } catch (err) {
    next(err);
  }
});

router.delete('/object', async (req, res, next) => {
  try {
    // Accept a key or a full public URL, since the admin form stores URLs.
    const key = r2.isValidKey(req.body.key) ? req.body.key : r2.keyFromUrl(req.body.url);
    if (!r2.isValidKey(key)) {
      return res.status(400).json({ error: 'Provide the object key or its R2 URL.' });
    }
    await r2.deleteObject(key);
    res.json({ message: 'File deleted from storage.', key });
  } catch (err) {
    next(err);
  }
});

/**
 * Refresh a signed playback URL. Only used when R2_PRIVATE_PLAYBACK is on;
 * the client calls this when a URL is close to expiring mid-film.
 */
router.post('/playback-url', async (req, res, next) => {
  try {
    const key = r2.isValidKey(req.body.key) ? req.body.key : r2.keyFromUrl(req.body.url);
    if (!r2.isValidKey(key)) {
      return res.status(400).json({ error: 'Provide the object key or its R2 URL.' });
    }
    res.json({ url: await r2.playbackUrl(key) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
