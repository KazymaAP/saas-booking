// общие/lib/security-headers.test.ts — CSP и заголовки безопасности из next.config.mjs.
// Регрессия, которую ловим: connect-src без origin Supabase. Браузер заливает фото по подписанной
// ссылке прямо в Storage (<project>.supabase.co), и при `connect-src 'self'` загрузка молча падала
// («Загружено 0 из 1»), хотя серверная часть была в порядке.
import { describe, expect, it } from 'vitest';
// next.config.mjs — JS без типов; для теста достаточно формы, которую он возвращает.
type NextConfigLike = { headers?: () => Promise<{ source: string; headers: Header[] }[]> };
// @ts-expect-error next.config.mjs — обычный JS без деклараций; форма описана типом NextConfigLike.
const configModule = (await import('../../next.config.mjs')) as unknown as { default: NextConfigLike };

type Header = { key: string; value: string };

// headers() читает env в момент вызова — выставляем origin явно, чтобы тест не зависел от .env.
const TEST_ORIGIN = 'https://test-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_ORIGIN;

async function siteHeaders(): Promise<Header[]> {
  const groups = await configModule.default.headers!();
  const all = groups.find((g) => g.source === '/:path*');
  return all ? all.headers : [];
}

function directive(csp: string, name: string): string {
  const part = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `));
  return part ?? '';
}

describe('security headers', () => {
  it('CSP разрешает загрузку в Storage: origin Supabase есть в connect-src', async () => {
    const csp = (await siteHeaders()).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
    expect(directive(csp, 'connect-src')).toContain(TEST_ORIGIN);
    // Realtime-канал идёт по wss — тоже должен быть разрешён.
    expect(directive(csp, 'connect-src')).toContain(TEST_ORIGIN.replace(/^https:/, 'wss:'));
  });

  it('script-src не содержит unsafe-eval вне dev', async () => {
    const csp = (await siteHeaders()).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
    if (process.env.NODE_ENV === 'production') expect(directive(csp, 'script-src')).not.toContain('unsafe-eval');
  });

  it('закрыты клики-угрозы: frame-ancestors, base-uri, object-src', async () => {
    const csp = (await siteHeaders()).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'self'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
  });

  it('базовые заголовки на месте', async () => {
    const headers = await siteHeaders();
    const get = (k: string) => headers.find((h) => h.key.toLowerCase() === k.toLowerCase())?.value ?? '';
    expect(get('X-Content-Type-Options')).toBe('nosniff');
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(get('Strict-Transport-Security')).toContain('max-age=31536000');
  });
});
