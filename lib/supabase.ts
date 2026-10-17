// lib/supabase.ts — клиенты Supabase (ТЗ §2, §34: service_role только на сервере).
// Оба клиента — singleton на процесс. Ключ кэша — значения env: при их смене (тесты, ротация ключа без
// перезапуска) клиент пересоздаётся, а не продолжает работать со старым ключом.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

type CachedClient = { cache_key: string; client: SupabaseClient };

let public_cache: CachedClient | null = null;
let admin_cache: CachedClient | null = null;

// Сессии не храним: серверный код без состояния, авторизация — по своим cookie (lib/*-session.ts).
const SERVER_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

function cached(slot: CachedClient | null, url: string, key: string): CachedClient {
  const cache_key = `${url}\n${key}`;
  if (slot?.cache_key === cache_key) return slot;
  return { cache_key, client: createClient(url, key, { auth: SERVER_AUTH }) };
}

// Публичный клиент: только то, что разрешено RLS для anon.
export function publicClient(): SupabaseClient {
  public_cache = cached(public_cache, requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  return public_cache.client;
}

// Серверный клиент с service_role. Импортировать только из серверного кода (route handlers, cron, server components).
export function adminClient(): SupabaseClient {
  admin_cache = cached(admin_cache, requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  return admin_cache.client;
}

// Сброс кэша клиентов: для тестов.
export function resetSupabaseClients(): void {
  public_cache = null;
  admin_cache = null;
}
