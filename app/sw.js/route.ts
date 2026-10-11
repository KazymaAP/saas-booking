// app/sw.js/route.ts — простой service worker (ТЗ §5.1: без Workbox). Кэширует оболочку, API не кэширует.
export const runtime = 'edge';

const SW = `
const CACHE = 'booking-shell-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/panel')) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(url.pathname, res.clone());
        return res;
      } catch {
        const cached = await caches.match(url.pathname);
        return cached || Response.error();
      }
    })());
  }
});
`;

export function GET() {
  return new Response(SW, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  });
}
