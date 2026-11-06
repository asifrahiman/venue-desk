// Venue Desk service worker: makes the app installable and lets it open offline
// with the last list it saw. Saving always needs a connection.
const CACHE = 'venue-desk-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first, cache as fallback (GET only; saves go straight to the network)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  // Skip other sites and the 2-second live checks (they shouldn't fill the cache)
  if (req.method !== 'GET' || u.origin !== location.origin || u.searchParams.has('since')) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
