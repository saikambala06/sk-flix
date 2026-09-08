'use strict';

/**
 * Tests the R2 helper against fake credentials. Presigning is pure local
 * crypto, so signature structure can be verified without touching Cloudflare.
 *
 *   node scripts/test-r2.js
 */

process.env.R2_ACCOUNT_ID = 'testaccount1234567890abcdef';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key-value-goes-here';
process.env.R2_BUCKET = 'skflip-media';
process.env.R2_PUBLIC_URL = 'https://media.skflip.test';

const path = require('path');
const r2 = require(path.join(__dirname, '..', 'api', 'lib', 'r2.js'));

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail !== undefined ? `  → ${detail}` : ''}`); }
};

(async () => {
  console.log('\nConfiguration');
  check('reports configured with all four variables set', r2.isConfigured());

  console.log('\nKey generation');
  const k1 = r2.buildKey('My Film (2024).mp4');
  check('slugifies the name', /^video\/\d{4}\/my-film-2024-[a-f0-9]{8}\.mp4$/.test(k1), k1);

  const k2 = r2.buildKey('My Film (2024).mp4');
  check('two uploads of the same name do not collide', k1 !== k2);

  const k3 = r2.buildKey('poster.jpg', 'poster');
  check('honours the prefix', k3.startsWith('poster/'), k3);

  const k4 = r2.buildKey('../../etc/passwd');
  check('traversal cannot escape the prefix', !k4.includes('..') && k4.startsWith('video/'), k4);

  const k5 = r2.buildKey('payload.php');
  check('unknown extension forced to .bin', k5.endsWith('.bin'), k5);

  const k6 = r2.buildKey('файл видео.mp4');
  check('non-latin name still yields a usable key', /^video\/\d{4}\/[a-z0-9-]+\.mp4$/.test(k6), k6);

  const k7 = r2.buildKey('a'.repeat(300) + '.mp4');
  check('very long name is truncated', k7.length < 120, k7.length);

  console.log('\nKey validation');
  check('rejects traversal', !r2.isValidKey('video/../../secret'));
  check('rejects absolute paths', !r2.isValidKey('/etc/passwd'));
  check('rejects control characters', !r2.isValidKey('video/a\u0000b.mp4'));
  check('rejects empty', !r2.isValidKey(''));
  check('accepts a normal key', r2.isValidKey('video/2026/film-a1b2c3d4.mp4'));

  console.log('\nContent types');
  check('.mp4 → video/mp4', r2.contentTypeFor('a/b.mp4') === 'video/mp4');
  check('.m3u8 → HLS type', r2.contentTypeFor('a/b.m3u8') === 'application/vnd.apple.mpegurl');
  check('.vtt → text/vtt', r2.contentTypeFor('a/b.vtt') === 'text/vtt');
  check('unknown → octet-stream', r2.contentTypeFor('a/b.zzz') === 'application/octet-stream');

  console.log('\nPlayback URLs');
  const url = await r2.playbackUrl('video/2026/film-a1b2c3d4.mp4');
  check('built from the public base',
    url === 'https://media.skflip.test/video/2026/film-a1b2c3d4.mp4', url);

  const spaced = await r2.playbackUrl('video/2026/my film.mp4');
  check('encodes spaces but keeps slashes',
    spaced === 'https://media.skflip.test/video/2026/my%20film.mp4', spaced);

  console.log('\nURL recognition and round-trip');
  check('recognises the configured public base', r2.isR2Url('https://media.skflip.test/video/x.mp4'));
  check('recognises an r2.dev URL', r2.isR2Url('https://pub-abc.r2.dev/video/x.mp4'));
  check('does not claim unrelated hosts', !r2.isR2Url('https://cdn.example.com/x.mp4'));
  check('ignores empty input', !r2.isR2Url(''));

  const key = 'video/2026/film-a1b2c3d4.mp4';
  check('URL round-trips back to its key', r2.keyFromUrl(await r2.playbackUrl(key)) === key,
    r2.keyFromUrl(await r2.playbackUrl(key)));

  const spacedKey = 'video/2026/my film.mp4';
  check('encoded URL round-trips', r2.keyFromUrl(await r2.playbackUrl(spacedKey)) === spacedKey,
    r2.keyFromUrl(await r2.playbackUrl(spacedKey)));

  console.log('\nPresigned uploads');
  const put = await r2.presignUpload('video/2026/test-abc.mp4', { contentType: 'video/mp4' });
  const parsed = new URL(put);
  check('points at the account endpoint',
    parsed.host === 'testaccount1234567890abcdef.r2.cloudflarestorage.com', parsed.host);
  check('includes the bucket and key in the path',
    parsed.pathname === '/skflip-media/video/2026/test-abc.mp4', parsed.pathname);
  check('uses SigV4', parsed.searchParams.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256');
  check('carries a signature', (parsed.searchParams.get('X-Amz-Signature') || '').length === 64);
  check('carries an expiry', parsed.searchParams.get('X-Amz-Expires') === '3600');
  check('never leaks the secret key', !put.includes(process.env.R2_SECRET_ACCESS_KEY));
  check('credential uses the access key id',
    (parsed.searchParams.get('X-Amz-Credential') || '').startsWith('test-access-key/'),
    parsed.searchParams.get('X-Amz-Credential'));

  // SigV4 is deterministic for identical inputs within the same second, which
  // is correct. What must differ is the signature for a different object.
  const putOther = await r2.presignUpload('video/2026/different-xyz.mp4', { contentType: 'video/mp4' });
  check('a different key produces a different signature',
    new URL(putOther).searchParams.get('X-Amz-Signature') !==
    parsed.searchParams.get('X-Amz-Signature'));

  const partUrl = await r2.presignPart('video/x.mp4', 'upload-id-123', 7);
  const partParsed = new URL(partUrl);
  check('part URL carries the part number', partParsed.searchParams.get('partNumber') === '7');
  check('part URL carries the upload id', partParsed.searchParams.get('uploadId') === 'upload-id-123');

  console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
