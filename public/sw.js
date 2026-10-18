// Never cache authenticated responses, source content, tokens, or editorial documents.
const CACHE = 'newsroom-static-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/icon.svg', '/offline.html'])));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  } else if (url.origin === self.location.origin && url.pathname === '/icon.svg') {
    event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
  }
});
