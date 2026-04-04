const CACHE_NAME = 'qgx-v4';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/register',
  '/manifest.json',
  '/offline.html',
];

// Install: cache static assets + offline page
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  // Skip API, auth, and password-reset routes (always use network)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (url.pathname.startsWith('/forgot-password') || url.pathname.startsWith('/reset-password')) return;

  // Network-first for navigation with offline fallback
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || caches.match('/offline.html')
          )
        )
    );
  } else {
    // Stale-while-revalidate for assets
    e.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request)
          .then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return res;
          })
          .catch(() => cached || new Response('', { status: 408, statusText: 'Offline' }));
        return cached || fetched;
      })
    );
  }
});

// Push notification handler
self.addEventListener('push', (e) => {
  let data = { title: 'QGX', body: 'You have a new notification', icon: '/icons/icon-192.svg' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      vibrate: [100, 50, 100],
      data: data,
    })
  );
});

// Notification click: focus or open app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/dashboard') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-messages') {
    e.waitUntil(syncOfflineMessages());
  }
});

async function syncOfflineMessages() {
  try {
    const cache = await caches.open('qgx-offline-actions');
    const keys = await cache.keys();
    for (const req of keys) {
      const res = await cache.match(req);
      if (res) {
        const body = await res.json();
        await fetch(req, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        await cache.delete(req);
        await cache.delete(req);
      }
    }
  } catch {
    // Will retry on next sync
  }
}
