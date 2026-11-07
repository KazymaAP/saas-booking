// tests/support/env.ts — доступ к тестовому Supabase для E2E. Только TEST_SUPABASE_* (ТЗ: «не ходить в прод БД»).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type TestEnv = { url: string; serviceKey: string };

export function testEnv(): TestEnv {
  const url = process.env.TEST_SUPABASE_URL ?? '';
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (url.length === 0 || serviceKey.length === 0) {
    throw new Error('E2E: задайте TEST_SUPABASE_URL и TEST_SUPABASE_SERVICE_ROLE_KEY (отдельный тестовый проект Supabase)');
  }
  // Защита от случайного запуска против прод-базы: тот же URL, что и в боевом окружении, запрещён.
  const prod = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (prod !== undefined && prod.length > 0 && prod === url && process.env.E2E_ALLOW_SAME_DB !== '1') {
    throw new Error('E2E: TEST_SUPABASE_URL совпадает с NEXT_PUBLIC_SUPABASE_URL — тесты против прод-БД запрещены');
  }
  return { url, serviceKey };
}

let client: SupabaseClient | null = null;
export function testDb(): SupabaseClient {
  if (client === null) {
    const env = testEnv();
    client = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
