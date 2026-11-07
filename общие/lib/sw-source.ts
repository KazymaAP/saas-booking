// lib/sw-source.ts — исходный текст service worker для app/sw.js/route.ts.
// Правила берутся из lib/sw-rules.ts через toString(): тот же код, что проверяют тесты, попадает в браузер.
import { RESERVED_SEGMENTS, SHELL_PATHS, SW_CACHE, isCacheableResponse, isShellPathWith } from './sw-rules';

// Только правила: константы и две чистые функции. Вычисляется и тестируется отдельно.
export function swRulesSource(): string {
  return [
    `const CACHE = ${JSON.stringify(SW_CACHE)};`,
    `const RESERVED = ${JSON.stringify(RESERVED_SEGMENTS)};`,
    `const SHELL = ${JSON.stringify(SHELL_PATHS)};`,
    isShellPathWith.toString(),
    isCacheableResponse.toString(),
  ].join('\n');
}

export function buildServiceWorker(): string {
  return `${swRulesSource()}

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
  if (url.search || url.origin !== self.location.origin || !isShellPathWith(url.pathname, SHELL, RESERVED)) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      const cacheable = isCacheableResponse({
        ok: res.ok,
        status: res.status,
        redirected: res.redirected,
        contentType: res.headers.get('content-type'),
        setCookie: res.headers.get('set-cookie'),
      });
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
}
