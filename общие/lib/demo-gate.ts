// общие/lib/demo-gate.ts — общий предохранитель для демо-входов (/api/demo/*).
//
// Зачем: демо-роут открывает НАСТОЯЩУЮ сессию (владельца, партнёра или клиента).
// Без гейта в продакшене любой желающий входит в демо-кабинет, а GET-метод позволяет
// дёрнуть его с чужого сайта через <img src="...">.
//
// Правила:
//   ▸ выключено по умолчанию — включается только явным DEMO_ENABLED=1;
//   ▸ запрос должен быть со своего origin (Sec-Fetch-Site), иначе 403.
export const DEMO_DISABLED_REASON = 'demo_disabled';
export const BAD_ORIGIN_REASON = 'bad_origin';

/** Демо-входы разрешены только при DEMO_ENABLED=1. Значение читается на каждом запросе (не кэшируется). */
export function demoEnabled(): boolean {
  return (process.env.DEMO_ENABLED ?? '').trim() === '1';
}

/**
 * true — запрос пришёл со своего же сайта.
 * Sec-Fetch-Site присылают все современные браузеры: cross-site/subresource → чужой сайт.
 * Отсутствие заголовка (curl, Playwright, серверный вызов) считаем своим: подделать его
 * из браузера нельзя, а без браузера CSRF-вектора нет.
 */
export function isSameOriginRequest(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (origin === null) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
