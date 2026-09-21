// Zoodle Service Worker for Android PWA Installability
const CACHE_NAME = 'zoodle-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css?v=1.2',
  '/css/game.css?v=1.2',
  '/css/video.css?v=1.2',
  '/js/sounds.js',
  '/js/avatar.js',
  '/js/canvas.js',
  '/js/webrtc.js',
  '/js/game.js',
  '/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Pass socket.io and dynamic API requests straight to network
  if (e.request.url.includes('/socket.io/') || e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request);
    })
  );
});
