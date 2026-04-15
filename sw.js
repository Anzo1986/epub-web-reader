const CACHE_NAME = 'epub-reader-v43.0';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/epubjs@0.3.88/dist/epub.min.js',
  'https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('/blob:http')) {
    const cleanBlobUrl = url.split('blob:')[1];
    if (cleanBlobUrl) {
      event.respondWith(
        fetch('blob:' + cleanBlobUrl).catch(() => Response.redirect('blob:' + cleanBlobUrl, 302))
      );
      return;
    }
  }
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
