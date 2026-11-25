// общие/lib/copy-mode-paths.ts — константы временного раздела /test/ful/sts.
// Вынесены отдельно от copy-mode.ts: тот использует next/headers и не годится для Edge-middleware.
export const COPY_PREFIX = '/test/ful/sts';
export const COPY_MODE_HEADER = 'x-copy-mode';
export const COPY_PATH_HEADER = 'x-copy-path';

// У копии этих адресов есть собственный динамический маршрут (app/test/ful/sts/...), поэтому
// middleware пропускает запрос как есть, а не переписывает на пререндеренную страницу.
// Причина: rewrite на статическую страницу отдавал HTML из кэша вместе с RSC-потоком нового
// рендера — React не сопоставлял деревья и падал в гидрации (4 исключения на каждой копии).
// inner — путь уже без префикса раздела, с ведущим слешем: '/d/vippro', '/GERA'.
// Первый сегмент служебных маршрутов: /pay/123 и /preview/x похожи на витрину /d/slug,
// но своего маршрута-копии у них нет — их должен обслуживать обычный rewrite.
const RESERVED_FIRST_SEGMENT = new Set([
  'api', 'admin', 'pay', 'invite', 'preview', 'dev', 'partner', 'domain-site',
  'booking', 'unsubscribe', 'auth', 'demo', 'my', 'test', 'uploads', 'assets', 'icons', 'fonts', '_next',
]);

export function hasOwnCopyRoute(inner: string): boolean {
  if (inner === '/GERA') return true;
  // API под префиксом копий запрещён отдельной проверкой в middleware; здесь он тоже не «свой».
  if (inner === '/api' || inner.startsWith('/api/')) return false;
  // Витрина бизнеса: ровно /{prefix}/{slug}, без вложенных разделов кабинета.
  const match = /^\/([a-z0-9]{1,6})\/[^/]+$/.exec(inner);
  if (!match) return false;
  return !RESERVED_FIRST_SEGMENT.has(match[1]);
}
