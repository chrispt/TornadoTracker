/**
 * Service worker — offline shell + opportunistic caching.
 *
 * Strategy:
 *   - Static assets (HTML/CSS/JS/images): cache-first, network fallback
 *   - NWS API responses: network-first with cache fallback (so a stale-but-
 *     readable feed survives a dropped connection)
 *
 * The feed snapshot and product details are persisted to IndexedDB by the
 * app — that handles the data layer. The SW handles the shell + raw API.
 */

const VERSION = 'tt-v1';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const API_CACHE = `${VERSION}-api`;

const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // NWS API: network-first
  if (url.hostname === 'api.weather.gov') {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // Same-origin static / built assets: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Third-party (e.g. tile servers, leaflet CSS): cache-first
  event.respondWith(cacheFirst(req, RUNTIME_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    return cached || new Response('Offline', { status: 503 });
  }
}

const API_CACHE_MAX = 50;

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  // Cache.keys() returns insertion order; drop the oldest.
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(req, res.clone());
      trimCache(cacheName, API_CACHE_MAX);
    }
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
