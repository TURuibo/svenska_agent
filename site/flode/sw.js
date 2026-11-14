/* Flöde service worker — registered by flode/index.html as "sw.js", so its scope is
 * site/flode/ only: pages elsewhere on the site are never controlled or cached by it.
 *
 * Strategy: stale-while-revalidate for same-origin GET requests made by controlled
 * Flöde pages (its own html/css/js, flode-data.js, ../styles.css, ../speak.js …):
 * answer from cache at once, refresh the cache in the background. Navigations fall
 * back to the cached index.html when offline. Bump CACHE_VERSION to drop all old caches.
 */
const CACHE_VERSION = 1;
const CACHE = `flode-v${CACHE_VERSION}`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('flode-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Cache key = URL without ?query, so `flode.js?v=3` and `?v=4` share one slot
// (the newest response replaces the older one instead of piling up).
function keyFor(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
}

async function refresh(request, key) {
  const res = await fetch(request);
  // Only same-origin, fully successful responses are stored (no opaque / error / partial ones).
  if (res.ok && res.status === 200 && res.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(key, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.headers.has('range')) return; // media/range requests: let the network handle them

  const key = keyFor(req.url);
  event.respondWith(
    (async () => {
      const cached = await caches.match(key, { cacheName: CACHE });
      const network = refresh(req, key).catch(() => null);
      if (cached) {
        event.waitUntil(network); // revalidate in the background
        return cached;
      }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') {
        const shell = await caches.match(keyFor(new URL('index.html', self.registration.scope)), { cacheName: CACHE })
          || await caches.match(keyFor(new URL('./', self.registration.scope)), { cacheName: CACHE });
        if (shell) return shell;
      }
      return Response.error();
    })()
  );
});
