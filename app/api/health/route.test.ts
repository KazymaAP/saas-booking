// app/api/health/route.test.ts — 200 при живой БД, 503 при ошибке/таймауте/без env, без чувствительных данных.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Outcome = 'ok' | 'error' | 'hang' | 'throw';
const db = { outcome: 'ok' as Outcome };

// Цепочка .from().select().limit().abortSignal() из supabase-js; abortSignal возвращает промис результата.
vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        limit: () => ({
          abortSignal: (signal: AbortSignal) => {
            if (db.outcome === 'throw') return Promise.reject(new Error('fetch failed: secret-host'));
            if (db.outcome === 'hang') {
              return new Promise((resolve) => signal.addEventListener('abort', () => resolve({ error: { message: 'aborted' } })));
            }
            return Promise.resolve({ error: db.outcome === 'error' ? { message: 'relation does not exist' } : null });
          },
        }),
      }),
    }),
  }),
}));

const ENV = {
  NEXT_PUBLIC_SITE_URL: 'https://zapishisya.ru',
  NEXT_PUBLIC_SUPABASE_URL: 'https://secret-project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
  ENCRYPTION_KEY: 'c'.repeat(64),
  CRON_SECRET: 'd'.repeat(32),
};

async function call(): Promise<{ status: number; body: Record<string, unknown>; text: string; res: Response }> {
  vi.resetModules();
  const { GET } = await import('./route');
  const res = await GET();
  const text = await res.clone().text();
  return { status: res.status, body: JSON.parse(text) as Record<string, unknown>, text, res };
}

describe('GET /api/health', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    vi.stubEnv('APP_VERSION', '1.2.3');
    db.outcome = 'ok';
  });

  it('БД отвечает → 200, версия, uptime, no-store', async () => {
    const { status, body, res } = await call();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', version: '1.2.3', checks: { env: 'ok', db: 'ok' } });
    expect(typeof body.uptime_s).toBe('number');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('ошибка БД → 503 degraded', async () => {
    db.outcome = 'error';
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body).toMatchObject({ status: 'degraded', checks: { db: 'error' } });
  });

  it('исключение SDK → 503, текст ошибки не раскрывается', async () => {
    db.outcome = 'throw';
    const { status, text } = await call();
    expect(status).toBe(503);
    expect(text).not.toContain('secret-host');
  });

  it('БД зависла → timeout, ответ ограничен таймаутом, а не зависанием', async () => {
    db.outcome = 'hang';
    // Порог таймаута задаём явно: на загруженной машине 150 мс по умолчанию + накладные расходы
    // легко давали 200+ мс и тест падал не по делу. Проверяем смысл: ответ приходит по таймауту.
    vi.stubEnv('HEALTH_DB_TIMEOUT_MS', '40');
    const started = Date.now();
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body).toMatchObject({ checks: { db: 'timeout' } });
    expect(Date.now() - started).toBeLessThan(600);
  });

  it('нет env → 503 misconfigured, без имён переменных', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { status, body, text } = await call();
    expect(status).toBe(503);
    expect(body).toMatchObject({ checks: { env: 'misconfigured', db: 'misconfigured' } });
    expect(text).not.toContain('SUPABASE');
  });

  it('ответ не содержит секретов и URL базы', async () => {
    const { text } = await call();
    for (const value of Object.values(ENV)) if (value.length > 8) expect(text).not.toContain(value);
  });
});
