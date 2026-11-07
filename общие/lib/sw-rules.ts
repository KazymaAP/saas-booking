// lib/sw-rules.ts — правила кэширования service worker (ТЗ §5.1).
// Функции чистые и без внешних ссылок: их исходный текст вставляется в service worker через toString()
// (см. lib/sw-source.ts), поэтому внутри них нельзя обращаться к переменным модуля — только к параметрам.

export const SW_CACHE = 'booking-shell-v3';

// Первые сегменты пути, которые никогда не кэшируются: персональные, токенные и служебные маршруты.
export const RESERVED_SEGMENTS = [
  'api', 'panel', 'booking', 'invite', 'magic-link', 'reset-password', 'unsubscribe',
  'data-request', 'blocked', 'preview', 'domain-site', 'sw.js', 'robots.txt', 'sitemap.xml', '_next',
];

// Статические публичные страницы без сегментов бизнеса.
export const SHELL_PATHS = ['/', '/oferta', '/privacy', '/dogovor-porucheniya'];

// Можно ли держать путь в кэше: статическая страница или публичная страница бизнеса /{prefix}/{slug}.
export function isShellPathWith(pathname: string, shell: string[], reserved: string[]): boolean {
  if (shell.indexOf(pathname) !== -1) return true;
  const parts = pathname.split('/').filter(Boolean);
  return parts.length === 2 && reserved.indexOf(parts[0]) === -1;
}

// Можно ли сохранить ответ: успешный HTML без редиректа и без Set-Cookie.
// Примечание: браузер не отдаёт Set-Cookie из fetch для same-origin ответов, поэтому полагаться на это условие
// нельзя — страницы оболочки сами не должны выставлять cookie.
export function isCacheableResponse(res: {
  ok: boolean;
  status: number;
  redirected: boolean;
  contentType: string | null;
  setCookie: string | null;
}): boolean {
  return res.ok
    && res.status === 200
    && !res.redirected
    && (res.contentType || '').indexOf('text/html') === 0
    && !res.setCookie;
}

// Серверная обёртка для тестов и проверок: использует константы модуля.
export function isShellPath(pathname: string): boolean {
  return isShellPathWith(pathname, SHELL_PATHS, RESERVED_SEGMENTS);
}
