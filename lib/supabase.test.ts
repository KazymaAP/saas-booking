// lib/supabase.test.ts — singleton клиентов, пересоздание при смене env, понятная ошибка без env.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn((url: string, key: string, options: unknown) => ({ url, key, options }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

const { adminClient, publicClient, resetSupabaseClients } = await import('./supabase');
const { EnvError } = await import('./env');

const URL_A = 'https://a.supabase.co';
const URL_B = 'https://b.supabase.co';

describe('lib/supabase', () => {
  beforeEach(() => {
    createClientMock.mockClear();
    resetSupabaseClients();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_A);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-a');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-a');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adminClient — singleton: повторный вызов не создаёт клиент', () => {
    const first = adminClient();
    const second = adminClient();
    expect(first).toBe(second);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(URL_A, 'service-a', expect.anything());
  });

  it('publicClient — singleton и использует anon key, а не service_role', () => {
    const first = publicClient();
    expect(publicClient()).toBe(first);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(URL_A, 'anon-a', expect.anything());
  });

  it('admin и public — разные клиенты', () => {
    expect(adminClient()).not.toBe(publicClient());
    expect(createClientMock).toHaveBeenCalledTimes(2);
  });

  it('смена ключа service_role → новый admin-клиент (нет «залипания» старого ключа)', () => {
    const first = adminClient();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-b');
    const second = adminClient();
    expect(second).not.toBe(first);
    expect(createClientMock).toHaveBeenLastCalledWith(URL_A, 'service-b', expect.anything());
  });

  it('смена URL проекта → новый клиент', () => {
    const first = publicClient();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_B);
    expect(publicClient()).not.toBe(first);
  });

  it('сессии не сохраняются и не обновляются (серверный код без состояния)', () => {
    adminClient();
    const options = createClientMock.mock.calls[0]?.[2];
    expect(options).toMatchObject({ auth: { persistSession: false, autoRefreshToken: false } });
  });

  it('нет SUPABASE_SERVICE_ROLE_KEY → EnvError с именем переменной', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(() => adminClient()).toThrow(EnvError);
    expect(() => adminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('нет NEXT_PUBLIC_SUPABASE_URL → EnvError', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '   ');
    expect(() => publicClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('resetSupabaseClients сбрасывает кэш', () => {
    const first = adminClient();
    resetSupabaseClients();
    expect(adminClient()).not.toBe(first);
  });
});
