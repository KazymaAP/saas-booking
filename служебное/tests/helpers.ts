// tests/helpers.ts — общие утилиты e2e юридического слоя.
import { createUnsubscribeToken } from '../../общие/lib/legal';

// Тот же секрет, что передаётся серверу в playwright.config.ts: токены, выпущенные тестом, сервер расшифрует.
export const E2E_SECRET = process.env.UNSUBSCRIBE_SECRET ?? 'e2e-unsubscribe-secret';

export function makeUnsubscribeToken(email: string): string {
  const token = createUnsubscribeToken(email, E2E_SECRET);
  if (!token) throw new Error('не удалось выпустить токен отписки');
  return token;
}

// Уникальный адрес на каждый прогон: идемпотентность проверяется на «чистом» адресе.
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const LEGAL_PAGES = [
  { path: '/oferta', title: 'Публичная оферта', related: ['/privacy', '/dogovor-porucheniya'] },
  { path: '/privacy', title: 'Политика обработки персональных данных', related: ['/oferta', '/dogovor-porucheniya', '/data-request'] },
  { path: '/dogovor-porucheniya', title: 'Договор поручения на обработку персональных данных', related: ['/privacy', '/oferta'] },
] as const;

// Убирает баннер cookie до загрузки страницы: тесты документов не должны зависеть от него.
export const DISMISS_COOKIE_SCRIPT = (version: string) =>
  `window.localStorage.setItem('cookie_consent', JSON.stringify({ version: '${version}', analytics: false, decided_at: new Date().toISOString() }));`;
