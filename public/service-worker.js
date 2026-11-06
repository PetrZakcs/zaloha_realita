// Bump when the caching strategy changes; old caches are removed on activate.
const CACHE_NAME = 'hra-reality-v2';
const ASSET_CACHE_LIMIT = 40;
const APP_SHELL = ['/', '/manifest.json', '/favicon.ico', '/logo192.png'];

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

async function putAndTrim(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
  // Every deploy adds new hashed bundles; without a limit they pile up forever.
  const assets = (await cache.keys()).filter((key) => new URL(key.url).pathname.startsWith('/static/'));
  await Promise.all(assets.slice(0, Math.max(0, assets.length - ASSET_CACHE_LIMIT)).map((key) => cache.delete(key)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept cross-origin requests (Supabase API/Storage/Auth) — those must
  // always hit the network directly, never served from cache.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    // Network-first, keeping the offline shell in step with the latest deploy.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Hashed build assets never change: cache-first.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) putAndTrim(request, response.clone());
          return response;
        });
      })
    );
    return;
  }

  // Everything else (manifest, icons) keeps its name across deploys: network-first, so it can't
  // go stale; the cached copy is only the offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
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
