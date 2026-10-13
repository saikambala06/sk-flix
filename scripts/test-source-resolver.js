'use strict';

/**
 * Tests resolveSource() and normalizeMediaUrl() by extracting them from
 * index.html and running them against real-world URL shapes.
 *
 *   node scripts/test-source-resolver.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

// Pull the resolver block out of the page.
const start = html.indexOf('const MEDIA_EXT = {');
const end = html.indexOf('/* dash.js is ~400 KB');
if (start === -1 || end === -1) {
  console.error('Could not locate the resolver block in index.html');
  process.exit(1);
}
const code = html.slice(start, end);

// Minimal browser shims.
const sandbox = { location: { origin: 'https://skflip.test' }, URL, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { resolveSource, normalizeMediaUrl } = sandbox;

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `  → ${detail}` : ''}`); }
};
const kindOf = (url) => resolveSource(url).kind;

console.log('\nStandard formats');
[
  ['https://cdn.example.com/movie.mp4', 'progressive'],
  ['https://cdn.example.com/movie.webm', 'progressive'],
  ['https://cdn.example.com/clip.mov', 'progressive'],
  ['https://cdn.example.com/master.m3u8', 'hls'],
  ['https://cdn.example.com/manifest.mpd', 'dash'],
].forEach(([url, want]) => check(`${url.split('/').pop()} → ${want}`, kindOf(url) === want, kindOf(url)));

console.log('\nContainers browsers cannot play');
['mkv', 'avi', 'wmv', 'flv', 'ts', '3gp', 'vob', 'm2ts'].forEach((ext) => {
  const r = resolveSource(`https://cdn.example.com/movie.${ext}`);
  check(`.${ext} flagged unsupported with guidance`,
    r.kind === 'unsupported' && r.reason.length > 20, r.kind);
});

console.log('\nQuery strings and signed URLs');
[
  ['https://cdn.example.com/movie.mp4?token=abc123&expires=999', 'progressive'],
  ['https://cdn.example.com/master.m3u8?sig=xyz', 'hls'],
  ['https://cdn.example.com/hls/12345/index?token=abc', 'hls'],
  ['https://cdn.example.com/video.mp4#t=30', 'progressive'],
].forEach(([url, want]) => check(`${want} survives query/hash`, kindOf(url) === want, kindOf(url)));

// The old code used src.includes('.m3u8'), which misfires here.
const trap = 'https://cdn.example.com/videos/m3u8-archive/movie.mp4';
check('an m3u8 substring in a path does not force HLS', kindOf(trap) === 'progressive', kindOf(trap));

console.log('\nPage URLs rejected with a reason');
[
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://vimeo.com/123456789',
  'https://mega.nz/file/abc123',
  'https://example.com/player.php?id=5',
].forEach((url) => {
  const r = resolveSource(url);
  check(`${url.slice(8, 40)}… → page`, r.kind === 'page' && r.reason.length > 20, r.kind);
});

console.log('\nShare links rewritten');
const drive = normalizeMediaUrl('https://drive.google.com/file/d/1AbC_dEf-GhI/view?usp=sharing');
check('Google Drive → direct link',
  drive.url === 'https://drive.google.com/uc?export=download&id=1AbC_dEf-GhI', drive.url);
check('Google Drive warns about reliability', drive.note.length > 20);

const dbx = normalizeMediaUrl('https://www.dropbox.com/s/abc/movie.mp4?dl=0');
check('Dropbox → raw=1', dbx.url.includes('raw=1') && !dbx.url.includes('dl=0'), dbx.url);

const gh = normalizeMediaUrl('https://github.com/user/repo/blob/main/clip.mp4');
check('GitHub blob → raw', gh.url.includes('/raw/'), gh.url);

console.log('\nEdge cases');
check('empty string does not throw', resolveSource('').kind === 'unsupported');
check('extensionless URL assumed progressive', kindOf('https://cdn.example.com/stream/4821') === 'progressive');
check('relative URL resolves', kindOf('/media/local.mp4') === 'progressive');
check('uppercase extension handled', kindOf('https://cdn.example.com/MOVIE.MP4') === 'progressive');
check('uppercase MKV still caught', kindOf('https://cdn.example.com/MOVIE.MKV') === 'unsupported');

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
