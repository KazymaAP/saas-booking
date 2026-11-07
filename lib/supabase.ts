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

// URL пула соединений для серверных клиентов.
// ВАЖНО: порт 6543 — это Postgres-wire пулер (pgbouncer/Supavisor, протокол Postgres), а supabase-js
// работает поверх HTTPS/REST (порт 443). Ставить JS-клиенту :6543 — ошибка: REST-запросы к БД зависают
// на ~20-30 с (таймаут), отсюда «медленные вкладки» и ошибки рендера. Пулер нужен только для ПРЯМЫХ
// pg-соединений, которые supabase-js не использует (PostgREST сам держит пул к БД на стороне сервиса).
// Поэтому по умолчанию JS-клиент ходит на обычный базовый URL (порт 443).
// Реальный HTTP-пулер подключается только если явно задан SUPABASE_POOLER_URL (полный URI из Dashboard).
export function poolerUrl(base: string = requireEnv('NEXT_PUBLIC_SUPABASE_URL')): string {
  const override = process.env.SUPABASE_POOLER_URL?.trim();
  const url = override || base;
  // supabase-js ходит поверх HTTPS/REST (порт 443). Postgres-пулер (postgresql://…:6543)
  // — это протокол Postgres, его нельзя передавать в createClient(): fetch() упадёт с
  // «Request cannot be constructed from a URL that includes credentials».
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      `Supabase URL должен начинаться с https://, получено: «${url.slice(0, 14)}…». ` +
        `Проверьте переменные NEXT_PUBLIC_SUPABASE_URL и SUPABASE_POOLER_URL в окружении — ` +
        `туда попал Postgres connection string вместо проектного URL (https://<project>.supabase.co).`
    );
  }
  return url;
}

function cached(slot: CachedClient | null, url: string, key: string): CachedClient {
  const cache_key = `${url}\n${key}`;
  if (slot?.cache_key === cache_key) return slot;
  return { cache_key, client: createClient(url, key, { auth: SERVER_AUTH }) };
}

// Публичный клиент: только то, что разрешено RLS для anon. Браузерный — на обычном URL (порт 5432).
export function publicClient(): SupabaseClient {
  public_cache = cached(public_cache, requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  return public_cache.client;
}

// Серверный клиент с service_role. Импортировать только из серверного кода (route handlers, cron, server components,
// server actions). Ходит через connection pooler (transaction mode, порт 6543) — см. poolerUrl().
export function adminClient(): SupabaseClient {
  admin_cache = cached(admin_cache, poolerUrl(), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  return admin_cache.client;
}

// Сброс кэша клиентов: для тестов.
export function resetSupabaseClients(): void {
  public_cache = null;
  admin_cache = null;
}
