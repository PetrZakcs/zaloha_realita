const CACHE_NAME = 'hra-reality-v1';
const APP_SHELL = ['/', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept cross-origin requests (Supabase API/Storage/Auth) — those must
  // always hit the network directly, never served from cache.
  if (new URL(request.url).origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    // Network-first for page loads, falling back to the cached shell when offline.
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // Cache-first for static build assets (JS/CSS/images).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
