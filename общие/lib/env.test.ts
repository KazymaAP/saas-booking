// lib/env.test.ts — проверка обязательных переменных и их формата.
import { describe, expect, it } from 'vitest';
import { checkEnv, EnvError, REQUIRED_ENV, requireEnv } from './env';

const VALID: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: 'https://zapishisya.ru',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  ENCRYPTION_KEY: 'a'.repeat(64),
  CRON_SECRET: 'c'.repeat(32),
};

describe('checkEnv', () => {
  it('полный корректный набор — без проблем', () => {
    expect(checkEnv(VALID)).toEqual([]);
  });

  it('каждая обязательная переменная проверяется', () => {
    expect(checkEnv({})).toHaveLength(REQUIRED_ENV.length);
  });

  it('пробелы вместо значения — «не задана»', () => {
    expect(checkEnv({ ...VALID, CRON_SECRET: '   ' })).toEqual(['CRON_SECRET: не задана']);
  });

  it('ENCRYPTION_KEY не 64 hex — ошибка формата', () => {
    const [problem] = checkEnv({ ...VALID, ENCRYPTION_KEY: 'zz' });
    expect(problem).toMatch(/^ENCRYPTION_KEY: неверный формат/);
  });

  it('короткий CRON_SECRET — ошибка формата', () => {
    expect(checkEnv({ ...VALID, CRON_SECRET: 'short' })[0]).toMatch(/CRON_SECRET/);
  });

  it('SITE_URL с путём и Supabase по http — ошибки формата', () => {
    const problems = checkEnv({ ...VALID, NEXT_PUBLIC_SITE_URL: 'https://a.ru/x', NEXT_PUBLIC_SUPABASE_URL: 'http://a.supabase.co' });
    expect(problems).toHaveLength(2);
  });

  it('локальный Supabase по http://127.0.0.1 допустим, произвольный http — нет', () => {
    expect(checkEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).toEqual([]);
    expect(checkEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321/' })).toEqual([]);
    expect(checkEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1.evil.ru' })).toHaveLength(1);
  });

  it('значения не попадают в текст ошибки (секреты не утекают в логи)', () => {
    const problems = checkEnv({ ...VALID, ENCRYPTION_KEY: 'secret-value-123' });
    expect(problems.join(' ')).not.toContain('secret-value-123');
  });
});

describe('requireEnv', () => {
  it('возвращает значение без пробелов по краям', () => {
    expect(requireEnv('CRON_SECRET', { CRON_SECRET: '  abc  ' })).toBe('abc');
  });

  it('нет значения → EnvError с подсказкой на .env.example', () => {
    expect(() => requireEnv('CRON_SECRET', {})).toThrow(EnvError);
    expect(() => requireEnv('CRON_SECRET', {})).toThrow(/\.env\.example/);
  });
});
