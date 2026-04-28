/**
 * Service worker — offline shell + opportunistic caching.
 *
 * Strategy:
 *   - HTML navigations: network-first. Critical, because Vite emits hashed
 *     asset filenames — a stale cached index.html would point at JS bundles
 *     that no longer exist after a deploy and produce a blank page.
 *   - Other static assets (hashed JS/CSS/images): cache-first.
 *   - NWS API responses: network-first with cache fallback (so a stale-but-
 *     readable feed survives a dropped connection).
 *
 * The feed snapshot and product details are persisted to IndexedDB by the
 * app — that handles the data layer. The SW handles the shell + raw API.
 */

const VERSION = 'tt-v4';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const API_CACHE = `${VERSION}-api`;
const API_CACHE_MAX = 50;

self.addEventListener('install', (event) => {
  // Activate immediately so users stuck on a stale shell recover on next reload.
  self.skipWaiting();
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

  // HTML navigations — always go to network first
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req, STATIC_CACHE));
    return;
  }

  const url = new URL(req.url);

  // NWS API: network-first
  if (url.hostname === 'api.weather.gov') {
    event.respondWith(networkFirst(req, API_CACHE, API_CACHE_MAX));
    return;
  }

  // Cross-origin requests (OSM tiles, leaflet CDN): pass through without
  // caching. Tile responses are bulky and opaque, and OSM's usage policy
  // discourages aggressive client-side caching. Same goes for unpkg —
  // the leaflet CSS is small and the CDN handles its own caching.
  if (url.origin !== self.location.origin) {
    return; // let the browser handle it normally
  }

  // Same-origin hashed assets: cache-first
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

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

async function networkFirst(req, cacheName, maxEntries) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(req, res.clone());
      if (maxEntries) trimCache(cacheName, maxEntries);
    }
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    // For navigations, fall back to any cached HTML so the user sees something.
    if (req.mode === 'navigate') {
      const fallback = await caches.match('/');
      if (fallback) return fallback;
    }
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
