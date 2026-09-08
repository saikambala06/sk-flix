/* SkFlip service worker.
 *
 * Strategy by resource type:
 *   app shell   → stale-while-revalidate (instant load, updates in background)
 *   API GETs    → network-first with a cache fallback (fresh when online,
 *                 browsable when not)
 *   images      → cache-first with a size cap
 *   video / API writes → never cached
 *
 * Bump CACHE_VERSION to force every client onto new assets.
 */

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `skflip-shell-${CACHE_VERSION}`;
const API_CACHE = `skflip-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `skflip-img-${CACHE_VERSION}`;

const SHELL_ASSETS = ['/', '/index.html', '/offline.html', '/manifest.json', '/icon.svg'];

const MAX_IMAGE_ENTRIES = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll rejects the whole batch if any single file 404s, so add
      // individually and tolerate misses.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('skflip-') && !key.endsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Keep a cache from growing without bound (no size API in the spec). */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

function isImage(request) {
  return (
    request.destination === 'image' ||
    /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(new URL(request.url).pathname)
  );
}

function isMedia(request) {
  return (
    request.destination === 'video' ||
    request.destination === 'audio' ||
    /\.(m3u8|ts|mp4|webm|m4s|mpd)(\?|$)/i.test(new URL(request.url).pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only GET is cacheable; a cached POST would be worse than useless.
  if (request.method !== 'GET') return;

  // Never touch video segments. They are large, range-requested, and often
  // on a different origin — caching them breaks seeking.
  if (isMedia(request)) return;

  // Range requests (seeking) must reach the network untouched.
  if (request.headers.has('range')) return;

  // ---- API: network first, fall back to the last good response -----------
  if (url.pathname.startsWith('/api/')) {
    // Auth responses are per-user and short-lived; do not persist them.
    if (url.pathname.startsWith('/api/auth/')) return;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: 'You are offline.', code: 'OFFLINE' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // ---- Images: cache first ------------------------------------------------
  if (isImage(request)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              if (response.ok || response.type === 'opaque') {
                const copy = response.clone();
                caches.open(IMAGE_CACHE).then((cache) => {
                  cache.put(request, copy);
                  trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES);
                });
              }
              return response;
            })
            .catch(() => new Response('', { status: 404 }))
      )
    );
    return;
  }

  // ---- Navigation: serve the shell, fall back to the offline page ---------
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match('/index.html')) ||
            (await caches.match('/offline.html')) ||
            new Response('Offline', { status: 503 })
          );
        })
    );
    return;
  }

  // ---- Everything else: stale-while-revalidate ----------------------------
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Lets the page trigger an immediate update instead of waiting for a reload.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
