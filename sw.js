const CACHE = 'nosso-dia-v7';
const PRECACHE = [
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (key === CACHE ? null : caches.delete(key))));
    try {
      await self.clients.claim();
    } catch {
      // Ignora corrida entre workers
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  const isHTML = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  if (isHTML || url.pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener('push', (event) => {
  // iOS exige showNotification em TODO push; sem isso a inscrição é revogada
  const mostrar = async () => {
    let title = 'Thallyson ❤️ Isla';
    let body = 'Pensei em você agora.';
    let url = '/?source=pwa';
    let icon = '/icons/icon-192.png';

    try {
      if (event.data) {
        const data = event.data.json();
        title = data.title || title;
        body = data.body || body;
        url = data.navigate || data.url || url;
        icon = data.icon || icon;
      }
    } catch {
      try {
        if (event.data) body = event.data.text() || body;
      } catch {
        // mantém fallback
      }
    }

    await self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icons/icon-192.png',
      tag: 'nosso-dia-recado',
      renotify: true,
      data: { url }
    });
  };

  event.waitUntil(mostrar());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/?source=pwa';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
