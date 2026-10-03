import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const base = process.env.VITE_BASE_PATH || '/';
if (!base.startsWith('/') || !base.endsWith('/') || !/^\/[A-Za-z0-9/_-]*$/.test(base)) {
  throw new Error('VITE_BASE_PATH must be a site path with leading and trailing slashes, such as /X/.');
}
async function files(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(dir, entry.name), `${prefix}${entry.name}/`) : `${prefix}${entry.name}`))).flat();
}
const assets = (await files('dist')).filter(file => file !== 'sw.js');
const hash = createHash('sha256').update(base);
for (const asset of assets) hash.update(asset).update(await readFile(join('dist', asset)));
const version = hash.digest('hex').slice(0, 12);
const cachePrefix = `convoy-leap-${encodeURIComponent(base)}-`;
await writeFile('dist/sw.js', `const BASE = ${JSON.stringify(base)};
const CACHE_PREFIX = ${JSON.stringify(cachePrefix)};
const CACHE = CACHE_PREFIX + ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(assets.map(file => `${base}${file}`))};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(asset => new Request(asset, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith(CACHE_PREFIX) || key.startsWith('rooftop-rush-' + encodeURIComponent(BASE) + '-')) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
async function navigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(new Request(request, { cache: 'no-cache' }));
    if (!response.ok) throw new Error('Navigation unavailable');
    if (response.headers.get('content-type')?.includes('text/html')) {
      try { await cache.put(BASE + 'index.html', response.clone()); } catch {}
    }
    return response;
  } catch {
    return (await cache.match(BASE + 'index.html')) || Response.error();
  }
}
async function asset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      try { await cache.put(request, response.clone()); } catch {}
    }
    return response;
  } catch {
    return Response.error();
  }
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  event.respondWith(event.request.mode === 'navigate' ? navigation(event.request) : asset(event.request));
});
`);
console.log(`Offline cache prepared at ${base}: ${assets.length} files.`);
