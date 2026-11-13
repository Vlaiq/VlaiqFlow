/* VLAIQ public app-shell cache. No API, GPS, wallet or external map response is cached. */
const VERSION = 'vlaiq-shell-v1';
// Filled by scripts/prepare-pwa.mjs after a production build.
const BUILT_FILES = [];
const SHELL_KEY = '/__vlaiq_public_shell__';
const PUBLIC_FILES = [
  '/offline.html', '/manifest.webmanifest', '/icon.svg',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
];

function mayStore(response) {
  return response.ok && response.type === 'basic'
    && !/private|no-store/i.test(response.headers.get('cache-control') || '')
    && !/cookie|authorization/i.test(response.headers.get('vary') || '');
}
async function publicFetch(path) {
  return fetch(new Request(path, { credentials: 'omit', cache: 'reload' }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all([...PUBLIC_FILES, ...BUILT_FILES].map(async path => {
      const response = await publicFetch(path);
      if (!mayStore(response)) throw new Error('Public shell asset unavailable');
      await cache.put(path, response);
    }));
    const index = await publicFetch('/');
    if (!mayStore(index) || !/text\/html/i.test(index.headers.get('content-type') || '')) return;
    const html = await index.clone().text();
    // Only Vite-built public entry assets referenced by public HTML; never arbitrary URLs.
    const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[A-Za-z0-9_.-]+\.(?:js|css))["']/g)].map(match => match[1]);
    await Promise.all([...new Set(assets)].map(async path => {
      const response = await publicFetch(path);
      if (!mayStore(response)) throw new Error('Entry asset unavailable');
      await cache.put(path, response);
    }));
    await cache.put(SHELL_KEY, index);
    // Deliberately no skipWaiting: an update must never reload an active GPS session.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('vlaiq-shell-') && key !== VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cache = await caches.open(VERSION);
        return (await cache.match(SHELL_KEY)) || (await cache.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }
  const staticAsset = !url.search && (/^\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff2?)$/.test(url.pathname) || PUBLIC_FILES.includes(url.pathname));
  if (!staticAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(url.pathname);
    if (hit) return hit;
    const response = await publicFetch(url.pathname);
    if (mayStore(response)) await cache.put(url.pathname, response.clone());
    return response;
  })());
});
