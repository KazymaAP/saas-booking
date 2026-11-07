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
    // Сеть ограничена по времени: подвисший ответ не должен вешать навигацию
    // (иначе браузер показывает белый экран и бесконечную загрузку).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(req, { signal: ctrl.signal });
      const cacheable = isCacheableResponse({
        ok: res.ok,
        status: res.status,
        redirected: res.redirected,
        contentType: res.headers.get('content-type'),
        setCookie: res.headers.get('set-cookie'),
      });
      if (cacheable) {
        // Кэшируем В ФОНЕ. Раньше ответ ждал await cache.put() — то есть полной вычитки тела,
        // и при медленном ответе страница не рендерилась вовсе (белый экран, вечная загрузка).
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then((c) => c.put(url.pathname, copy)).catch(() => undefined));
      }
      return res;
    } catch (err) {
      // Офлайн/таймаут: только из публичной оболочки (по проверке выше сюда попадают лишь такие пути).
      const cached = await caches.match(url.pathname);
      return cached || Response.error();
    } finally {
      clearTimeout(timer);
    }
  })());
});
`;
}
