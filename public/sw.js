/**
 * SkFlip Service Worker — sw.js
 * Strategy:
 *   • Static shell (HTML, CSS, JS, fonts, images) → Cache First, fallback to network
 *   • /api/* calls                                → Network First, no caching
 *   • HLS streams (m3u8, ts segments)             → Network Only (too large to cache)
 *
 * Update: bump CACHE_VERSION to force all clients to pick up the new shell.
 */

const CACHE_VERSION = 'skflip-v1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const IMAGE_CACHE   = `${CACHE_VERSION}-images`;

// Core shell files to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  // External fonts/icons are cached on first use (see fetch handler)
];

// ── Install: pre-cache shell ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('skflip-') && k !== STATIC_CACHE && k !== IMAGE_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing logic ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET requests
  if (request.method !== 'GET') return;

  // 2. API calls — Network Only (always fresh)
  if (url.pathname.startsWith('/api/')) return;

  // 3. HLS streams — Network Only (too large, too dynamic)
  if (url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts')) return;

  // 4. Chrome extension / non-http(s) — skip
  if (!url.protocol.startsWith('http')) return;

  // 5. Cross-origin images (movie posters from CDN) — Cache Then Network
  if (request.destination === 'image' && url.origin !== self.location.origin) {
    event.respondWith(imageStrategy(request));
    return;
  }

  // 6. Google Fonts / FontAwesome / external CDN scripts — Cache First
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')    ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 7. Same-origin pages / assets — Stale While Revalidate
  //    Returns cached version immediately; fetches fresh copy in background.
  event.respondWith(staleWhileRevalidate(request));
});

// ── Strategies ────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request) {
  const cache    = await caches.open(STATIC_CACHE);
  const cached   = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || await fetchPromise || offlineFallback(request);
}

async function imageStrategy(request) {
  const cache  = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a transparent 1×1 PNG as image placeholder
    const placeholder = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return new Response(
      Uint8Array.from(atob(placeholder), c => c.charCodeAt(0)),
      { headers: { 'Content-Type': 'image/png' } }
    );
  }
}

function offlineFallback(request) {
  if (request.destination === 'document') {
    return caches.match('/') || new Response(
      '<h1 style="font-family:sans-serif;text-align:center;margin-top:20vh;color:#e0a830">SkFlip is offline</h1>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
  return new Response('', { status: 503, statusText: 'Offline' });
}

// ── Background Sync placeholder (for future offline wishlist sync) ─────────
self.addEventListener('sync', event => {
  if (event.tag === 'skflip-wishlist-sync') {
    // TODO: flush pending wishlist operations when back online
    console.log('[SkFlip SW] background sync:', event.tag);
  }
});

// ── Push notifications placeholder ────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'SkFlip', {
      body: data.body || 'New content is available!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
