'use strict';

/**
 * Cloudflare R2 integration.
 *
 * R2 is S3-compatible, so the AWS SDK talks to it directly — only the endpoint
 * and region differ. Two things make it the right fit for video here:
 *
 *   1. Egress is free at any volume, so bandwidth cannot produce a surprise
 *      bill the way it does on Cloudinary or S3.
 *   2. It serves HTTP range requests, which is what makes seeking work and
 *      what large progressive files depend on.
 *
 * The important architectural point: video never passes through this API.
 * Vercel caps a serverless request body at 4.5 MB, so a 2 GB film could not be
 * proxied even if we wanted to. The browser uploads straight to R2 using a
 * presigned URL that this module signs; the server only ever handles the
 * signature, never the bytes.
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  UploadPartCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;

// The domain viewers download from. Either a bucket custom domain or the
// r2.dev subdomain. Without it we cannot build a playable URL.
const PUBLIC_BASE = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

// When true, playback URLs are signed and expire. Keeps the bucket private at
// the cost of CDN cacheability — see the README trade-off note.
const PRIVATE_PLAYBACK = process.env.R2_PRIVATE_PLAYBACK === 'true';
const PLAYBACK_TTL = parseInt(process.env.R2_PLAYBACK_TTL || '21600', 10); // 6h

let client = null;

function isConfigured() {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);
}

function getClient() {
  if (client) return client;
  if (!isConfigured()) throw new Error('R2 is not configured on this server.');

  client = new S3Client({
    region: 'auto', // R2 ignores region but the SDK requires one
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    // R2 does not support flexible checksums; without this the SDK adds
    // headers R2 rejects with a 400 on presigned PUTs.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    // Path-style (endpoint/bucket/key) is the form Cloudflare documents for
    // the R2 S3 API. The SDK defaults to virtual-hosted style, which puts the
    // bucket in the hostname and breaks outright for names containing a dot.
    forcePathStyle: true,
  });
  return client;
}

/* ------------------------------------------------------------------ */
/*  Keys                                                              */
/* ------------------------------------------------------------------ */

const SAFE_EXT = new Set([
  'mp4', 'webm', 'ogv', 'mov', 'm4v', 'm3u8', 'ts', 'mpd', 'm4s',
  'vtt', 'srt', 'jpg', 'jpeg', 'png', 'webp', 'avif',
]);

/**
 * Build a storage key that is safe, unique and readable.
 * "My Film (2024).mp4" → "video/2026/my-film-2024-a1b2c3d4.mp4"
 */
function buildKey(filename, prefix = 'video') {
  const raw = String(filename || 'file').trim();
  const dot = raw.lastIndexOf('.');
  const ext = dot > -1 ? raw.slice(dot + 1).toLowerCase() : '';
  const stem = dot > -1 ? raw.slice(0, dot) : raw;

  const slug =
    stem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file';

  const suffix = crypto.randomBytes(4).toString('hex');
  const safeExt = SAFE_EXT.has(ext) ? ext : 'bin';
  const year = new Date().getFullYear();

  return `${prefix}/${year}/${slug}-${suffix}.${safeExt}`;
}

/** Reject traversal and absolute keys before they reach the bucket. */
function isValidKey(key) {
  return (
    typeof key === 'string' &&
    key.length > 0 &&
    key.length < 900 &&
    !key.startsWith('/') &&
    !key.includes('..') &&
    !/[\x00-\x1f]/.test(key)
  );
}

const CONTENT_TYPES = {
  mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm',
  ogv: 'video/ogg', mov: 'video/quicktime',
  m3u8: 'application/vnd.apple.mpegurl', ts: 'video/mp2t',
  mpd: 'application/dash+xml', m4s: 'video/iso.segment',
  vtt: 'text/vtt', srt: 'application/x-subrip',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', avif: 'image/avif',
};

function contentTypeFor(key) {
  const ext = String(key).split('.').pop().toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

/* ------------------------------------------------------------------ */
/*  Simple upload (single PUT, for files under ~100 MB)               */
/* ------------------------------------------------------------------ */

async function presignUpload(key, { contentType, expiresIn = 3600 } = {}) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType || contentTypeFor(key),
    // A year of immutable caching. Keys carry a random suffix, so a changed
    // file is always a new key and stale cache entries cannot happen.
    CacheControl: 'public, max-age=31536000, immutable',
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}

/* ------------------------------------------------------------------ */
/*  Multipart upload (large files)                                    */
/* ------------------------------------------------------------------ */

async function createMultipart(key, contentType) {
  const res = await getClient().send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType || contentTypeFor(key),
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return res.UploadId;
}

async function presignPart(key, uploadId, partNumber, expiresIn = 3600) {
  const command = new UploadPartCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}

async function completeMultipart(key, uploadId, parts) {
  // S3 requires parts in ascending order; a browser finishing them out of
  // order would otherwise produce a corrupt object.
  const ordered = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
  const res = await getClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: ordered },
    })
  );
  return res.Location;
}

async function abortMultipart(key, uploadId) {
  await getClient().send(
    new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId })
  );
}

/* ------------------------------------------------------------------ */
/*  Read side                                                         */
/* ------------------------------------------------------------------ */

/** The URL a viewer plays from. Signed when private playback is enabled. */
async function playbackUrl(key) {
  if (!isValidKey(key)) return '';

  if (PRIVATE_PLAYBACK) {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return getSignedUrl(getClient(), command, { expiresIn: PLAYBACK_TTL });
  }

  if (!PUBLIC_BASE) return '';
  // Encode each segment separately so slashes stay as path separators.
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${PUBLIC_BASE}/${encoded}`;
}

/** True when a URL points at this deployment's R2 bucket. */
function isR2Url(url) {
  if (!url || typeof url !== 'string') return false;
  if (PUBLIC_BASE && url.startsWith(PUBLIC_BASE)) return true;
  return /\.r2\.dev\//.test(url) || /\.r2\.cloudflarestorage\.com\//.test(url);
}

/** Recover the object key from a public R2 URL, for deletes. */
function keyFromUrl(url) {
  if (!isR2Url(url)) return '';
  try {
    if (PUBLIC_BASE && url.startsWith(PUBLIC_BASE)) {
      return decodeURIComponent(url.slice(PUBLIC_BASE.length).replace(/^\/+/, '').split('?')[0]);
    }
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return '';
  }
}

async function headObject(key) {
  const res = await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  return { size: res.ContentLength, contentType: res.ContentType, lastModified: res.LastModified };
}

async function deleteObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function listObjects(prefix = '', maxKeys = 100) {
  const res = await getClient().send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: maxKeys })
  );
  return (res.Contents || []).map((o) => ({
    key: o.Key,
    size: o.Size,
    lastModified: o.LastModified,
  }));
}

module.exports = {
  isConfigured,
  buildKey,
  isValidKey,
  contentTypeFor,
  presignUpload,
  createMultipart,
  presignPart,
  completeMultipart,
  abortMultipart,
  playbackUrl,
  isR2Url,
  keyFromUrl,
  headObject,
  deleteObject,
  listObjects,
  PRIVATE_PLAYBACK,
  PUBLIC_BASE,
};
