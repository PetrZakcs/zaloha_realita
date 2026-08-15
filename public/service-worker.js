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

// Web Push retention notifications (MVP1 spec-3 §14A) — the actual sending happens
// server-side (supabase/functions/send-retention-push, on a pg_cron schedule); this is just
// the browser-side half that turns a received push into a visible OS notification, and
// routes a tap back into the app. See src/lib/push.js for the subscribe/unsubscribe flow.
self.addEventListener('push', (event) => {
  let data = { title: 'Hra Reality', body: '', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Hra Reality', {
      body: data.body || '',
      icon: '/logo192.png',
      badge: '/logo192.png',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Reuse an already-open tab if there is one, rather than always opening a new one.
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
