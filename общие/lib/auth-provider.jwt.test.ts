// общие/lib/auth-provider.jwt.test.ts — доверие к SUPABASE_JWT_SECRET.
// Смысл проверки: короткая заглушка в .env не должна позволять подписать себе сессию супер-админа.
import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_BACKUP = { secret: process.env.SUPABASE_JWT_SECRET };

async function load() {
  vi.resetModules();
  return import('./auth-provider');
}

afterEach(() => {
  if (ENV_BACKUP.secret === undefined) delete process.env.SUPABASE_JWT_SECRET;
  else process.env.SUPABASE_JWT_SECRET = ENV_BACKUP.secret;
  vi.unstubAllEnvs();
});

describe('jwtSecretTrusted', () => {
  it('длинный секрет принимается в любом окружении', async () => {
    process.env.SUPABASE_JWT_SECRET = 'a'.repeat(40);
    const { jwtSecretTrusted } = await load();
    expect(jwtSecretTrusted()).toBe(true);
  });

  it('короткий секрет в production не принимается', async () => {
    process.env.SUPABASE_JWT_SECRET = 'placeholder';
    vi.stubEnv('NODE_ENV', 'production');
    const { jwtSecretTrusted } = await load();
    expect(jwtSecretTrusted()).toBe(false);
  });

  it('короткий секрет локально принимается — иначе не работает dev-стенд', async () => {
    process.env.SUPABASE_JWT_SECRET = 'placeholder';
    vi.stubEnv('NODE_ENV', 'development');
    const { jwtSecretTrusted } = await load();
    expect(jwtSecretTrusted()).toBe(true);
  });

  it('пустой секрет не принимается никогда', async () => {
    process.env.SUPABASE_JWT_SECRET = '   ';
    vi.stubEnv('NODE_ENV', 'development');
    const { jwtSecretTrusted } = await load();
    expect(jwtSecretTrusted()).toBe(false);
  });

  it('ровно 32 символа — уже доверенный', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { jwtSecretTrusted, MIN_JWT_SECRET_LENGTH } = await load();
    expect(jwtSecretTrusted('b'.repeat(MIN_JWT_SECRET_LENGTH))).toBe(true);
    expect(jwtSecretTrusted('b'.repeat(MIN_JWT_SECRET_LENGTH - 1))).toBe(false);
  });
});
