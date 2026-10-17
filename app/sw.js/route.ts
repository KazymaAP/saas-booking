// app/sw.js/route.ts — service worker PWA (ТЗ §5.1: без Workbox).
// Кэширует ТОЛЬКО публичную оболочку: главную, юридические страницы и публичную страницу бизнеса /{prefix}/{slug}.
// Никогда не кэширует и не трогает: API, кабинеты, записи, токенные страницы (отмена, перенос, приглашение,
// вход по ссылке, сброс, отписка, выгрузка данных), запросы с query-строкой, редиректы, ошибки и ответы с Set-Cookie.
// Токены из ссылок не должны оседать в Cache Storage устройства.
export const runtime = 'edge';

const CACHE_VERSION = 'booking-shell-v2';

const SW = `
const CACHE = '${CACHE_VERSION}';
// Первые сегменты пути, которые никогда не кэшируются: персональные, токенные и служебные маршруты.
const RESERVED = [
  'api', 'panel', 'booking', 'invite', 'magic-link', 'reset-password', 'unsubscribe',
  'data-request', 'blocked', 'preview', 'domain-site', 'sw.js', 'robots.txt', 'sitemap.xml', '_next'
];
// Статические публичные страницы без сегментов бизнеса.
const SHELL = ['/', '/oferta', '/privacy', '/dogovor-porucheniya'];

function isShellPath(pathname) {
  if (SHELL.indexOf(pathname) !== -1) return true;
  // Публичная страница бизнеса: ровно два сегмента /{prefix}/{slug}, первый не зарезервирован.
  const parts = pathname.split('/').filter(Boolean);
  return parts.length === 2 && RESERVED.indexOf(parts[0]) === -1;
}

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Удаляем все прежние кэши (включая v1 с возможными токенными страницами).
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  const url = new URL(req.url);
  // Query-строка (?token=...), чужой origin и непубличные пути — не перехватываем вовсе.
  if (url.search || url.origin !== self.location.origin || !isShellPath(url.pathname)) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      const cacheable = res.ok
        && res.status === 200
        && !res.redirected
        && (res.headers.get('content-type') || '').indexOf('text/html') === 0
        && !res.headers.get('set-cookie');
      if (cacheable) {
        const cache = await caches.open(CACHE);
        await cache.put(url.pathname, res.clone());
      }
      return res;
    } catch (err) {
      // Офлайн: только из публичной оболочки (по проверке выше сюда попадают лишь такие пути).
      const cached = await caches.match(url.pathname);
      return cached || Response.error();
    }
  })());
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
