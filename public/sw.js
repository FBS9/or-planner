const CACHE_NAME = 'or-planner-cache-v2';
const APP_SHELL = ['/', '/manifest.webmanifest'];
const STATIC_ASSET_PATH_PREFIXES = ['/assets/'];
const ACCEPTABLE_RESPONSE_TYPES = new Set(['basic', 'default']);

const isSameOrigin = (url) => url.origin === self.location.origin;
const isAppShellRequest = (url) => APP_SHELL.includes(url.pathname);
const isStaticAssetRequest = (url) =>
  STATIC_ASSET_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
const isCacheableRequest = (request, url) =>
  request.method === 'GET' && isSameOrigin(url) && (isAppShellRequest(url) || isStaticAssetRequest(url));
const isCacheableResponse = (response) =>
  response && response.ok && ACCEPTABLE_RESPONSE_TYPES.has(response.type);

const putCache = async (request, response) => {
  const url = new URL(request.url);
  if (!isCacheableRequest(request, url) || !isCacheableResponse(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
};

const networkFirst = async (request, fallbackUrl = '/') => {
  try {
    const response = await fetch(request);
    await putCache(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    return cached || caches.match(fallbackUrl);
  }
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  await putCache(request, response);
  return response;
};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
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
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET' || !isSameOrigin(url) || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (!isCacheableRequest(event.request, url)) return;

  if (isStaticAssetRequest(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});
