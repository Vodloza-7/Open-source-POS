const CACHE_NAME = 'open-pos-v1.1.0';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/css/multicurrency.css',
  '/config.js',
  '/app.js',
  '/manifest.webmanifest',
  '/js/router.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/login.js',
  '/js/pos.js',
  '/js/products.js',
  '/js/sales.js',
  '/js/admin.js',
  '/js/zimra.js',
  '/js/multicurrency.js',
  '/js/offline-sync.js',
  '/pages/login.html',
  '/pages/pos.html',
  '/pages/products.html',
  '/pages/sales.html',
  '/pages/admin.html',
  '/pages/exchange-settings.html',
  '/assets/logo.png',
  '/assets/pos-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
