/* REBUILT Arena offline shell. All URLs are resolved against the worker's own
   scope so the same file works at the domain root and under a subpath. */
const SCOPE = new URL('./', self.location.href);
const BASE_PATH = SCOPE.pathname;

const CACHE = 'rebuilt-arena-v2';
const asset = (path) => new URL(path, SCOPE).href;
const SHELL = asset('index.html');

const PRECACHE = [
  asset('./'),
  SHELL,
  asset('manifest.webmanifest'),
  asset('icon.svg'),
  asset('fonts/barlow-condensed-500.woff2'),
  asset('fonts/barlow-condensed-600.woff2'),
  asset('fonts/barlow-condensed-700.woff2'),
  asset('fonts/barlow-condensed-800.woff2'),
  asset('fonts/inter-400.woff2'),
  asset('fonts/inter-500.woff2'),
  asset('fonts/inter-600.woff2'),
  asset('fonts/inter-700.woff2'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(`${BASE_PATH}api/`) || url.pathname === `${BASE_PATH}ws`) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL).then((hit) => hit || caches.match(asset('./')))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL));
    }),
  );
});
