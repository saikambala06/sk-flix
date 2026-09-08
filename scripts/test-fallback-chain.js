'use strict';

/**
 * Exercises the source fallback chain by extracting the real functions from
 * index.html and running them against a simulated media stack.
 *
 *   node scripts/test-fallback-chain.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function slice(from, to, label) {
  const a = html.indexOf(from);
  const b = html.indexOf(to);
  if (a === -1 || b === -1 || b <= a) {
    console.error(`Could not extract ${label} (from=${a}, to=${b})`);
    process.exit(1);
  }
  return html.slice(a, b);
}

const resolverCode = slice('const MEDIA_EXT = {', '/* dash.js is ~400 KB', 'resolver');
const chainCode = slice('function buildSourceCandidates(movie){', '\nfunction attachVideoSource(', 'chain');

/* ---- Simulated browser ------------------------------------------------- */
const events = {};
const toasts = [];
const video = {
  currentTime: 0,
  error: null,
  addEventListener(name, fn, opts) { (events[name] = events[name] || []).push({ fn, once: opts && opts.once }); },
  fire(name) {
    const list = events[name] || [];
    events[name] = list.filter((h) => !h.once);
    list.forEach((h) => h.fn());
  },
};

let attached = [];
const sandbox = {
  location: { origin: 'https://skflip.test' },
  URL, console: { warn() {}, error() {}, info() {}, log: console.log },
  video,
  poster: { classList: { remove() {}, add() {} } },
  state: {
    currentMovie: null, _resumeTime: 0, _srcGen: 0,
    _sourceQueue: [], _sourceIndex: -1, _sourceFailures: [],
  },
  showToast: (msg, kind) => toasts.push({ msg, kind }),
  _hideVideoSkeleton() {},
  // Stand-in for attachVideoSource: records the attempt instead of playing.
  attachVideoSource(resolved) { attached.push(resolved); },
};
vm.createContext(sandbox);
vm.runInContext(resolverCode + '\n' + chainCode, sandbox);

const { startSourceChain, advanceSource, buildSourceCandidates } = sandbox;

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail !== undefined ? `  → ${detail}` : ''}`); }
};

function reset(movie) {
  attached = [];
  toasts.length = 0;
  Object.keys(events).forEach((k) => delete events[k]);
  video.currentTime = 0;
  sandbox.state.currentMovie = movie;
  sandbox.state._resumeTime = 0;
  sandbox.state._sourceFailures = [];
}

const HLS = 'https://cdn.example.com/master.m3u8';
const MP4 = 'https://cdn.example.com/movie.mp4';
const MKV = 'https://cdn.example.com/movie.mkv';

console.log('\nCandidate building');
let c = buildSourceCandidates({ hlsUrl: HLS, videoUrl: MP4 });
check('two sources produce two candidates', c.length === 2, c.length);
check('adaptive stream is tried first', c[0].resolved.kind === 'hls', c[0].resolved.kind);
check('direct file is second', c[1].resolved.kind === 'progressive', c[1].resolved.kind);

c = buildSourceCandidates({ hlsUrl: MP4, videoUrl: MP4 });
check('identical URLs deduplicated', c.length === 1, c.length);

c = buildSourceCandidates({ hlsUrl: '', videoUrl: MP4 });
check('empty field skipped', c.length === 1, c.length);
check('no sources yields empty list', buildSourceCandidates({}).length === 0);

console.log('\nHappy path');
reset({ hlsUrl: HLS, videoUrl: MP4 });
startSourceChain(sandbox.state.currentMovie);
check('first attempt uses HLS', attached.length === 1 && attached[0].kind === 'hls', attached[0] && attached[0].kind);
check('no toast when nothing failed', toasts.length === 0, JSON.stringify(toasts));

console.log('\nFallback on failure');
reset({ hlsUrl: HLS, videoUrl: MP4 });
startSourceChain(sandbox.state.currentMovie);
advanceSource('CORS blocked');
check('falls back to the direct file', attached.length === 2 && attached[1].kind === 'progressive', attached.length);
check('viewer is told about the switch', toasts.some((t) => /backup source/i.test(t.msg)), JSON.stringify(toasts));
check('switch toast is not an error', toasts[0] && toasts[0].kind === 'info', toasts[0] && toasts[0].kind);

console.log('\nPosition preserved across fallback');
reset({ hlsUrl: HLS, videoUrl: MP4 });
startSourceChain(sandbox.state.currentMovie);
video.currentTime = 1230;            // twenty minutes in
advanceSource('stream died mid-playback');
check('resume time carried over', sandbox.state._resumeTime === 1230, sandbox.state._resumeTime);

reset({ hlsUrl: HLS, videoUrl: MP4 });
startSourceChain(sandbox.state.currentMovie);
video.currentTime = 0.4;             // failed before playback really began
advanceSource('manifest 404');
check('trivial position not treated as resume', sandbox.state._resumeTime === 0, sandbox.state._resumeTime);

console.log('\nUnplayable formats skipped without an attempt');
reset({ hlsUrl: HLS, videoUrl: MKV });
startSourceChain(sandbox.state.currentMovie);
advanceSource('stream failed');
check('MKV never attempted', !attached.some((a) => a.ext === 'mkv'), JSON.stringify(attached.map((a) => a.ext)));
check('gives up after skipping it', attached.length === 1, attached.length);
check('error names the MKV problem',
  toasts.some((t) => t.kind === 'error' && /MKV|remux|ffmpeg/i.test(t.msg)),
  JSON.stringify(toasts));

console.log('\nExhaustion');
reset({ hlsUrl: HLS, videoUrl: MP4 });
startSourceChain(sandbox.state.currentMovie);
advanceSource('first failed');
advanceSource('second failed');
check('stops after the last source', attached.length === 2, attached.length);
check('reports a terminal error', toasts.some((t) => t.kind === 'error'), JSON.stringify(toasts));

reset({ hlsUrl: '', videoUrl: MP4 });
startSourceChain(sandbox.state.currentMovie);
advanceSource('only source failed');
check('single failure reports its actual cause',
  toasts.some((t) => t.kind === 'error' && /only source failed/.test(t.msg)),
  JSON.stringify(toasts));

console.log('\nNo infinite loops');
reset({ hlsUrl: HLS, videoUrl: MP4 });
startSourceChain(sandbox.state.currentMovie);
for (let i = 0; i < 25; i++) advanceSource('repeated failure');
check('queue cannot be advanced past its end', attached.length === 2, attached.length);

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
