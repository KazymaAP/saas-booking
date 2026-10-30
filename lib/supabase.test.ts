// lib/supabase.test.ts — singleton клиентов, пересоздание при смене env, понятная ошибка без env.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn((url: string, key: string, options: unknown) => ({ url, key, options }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

const { adminClient, publicClient, resetSupabaseClients, poolerUrl } = await import('./supabase');
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
    // server-side клиент ходит через pooler (transaction mode, порт 6543).
    expect(createClientMock).toHaveBeenCalledWith('https://a.supabase.co:6543', 'service-a', expect.anything());
  });

  it('adminClient — без SUPABASE_POOLER_URL преобразует порт 5432→6543', () => {
    expect(poolerUrl(URL_A)).toBe('https://a.supabase.co:6543');
    expect(poolerUrl('https://a.supabase.co:5432')).toBe('https://a.supabase.co:6543');
    // локальный supabase start — без изменений (пула нет).
    expect(poolerUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
  });

  it('adminClient — SUPABASE_POOLER_URL переопределяет преобразование', () => {
    vi.stubEnv('SUPABASE_POOLER_URL', 'https://pool.override.example/pooler');
    const first = adminClient();
    const second = adminClient();
    expect(first).toBe(second);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith('https://pool.override.example/pooler', 'service-a', expect.anything());
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
    expect(createClientMock).toHaveBeenLastCalledWith('https://a.supabase.co:6543', 'service-b', expect.anything());
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
