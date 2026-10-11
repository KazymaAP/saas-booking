// lib/supabase.ts — клиенты Supabase (ТЗ §2, §34: service_role только на сервере).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Публичный клиент: только то, что разрешено RLS для anon.
export function publicClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

// Серверный клиент с service_role. Импортировать только из серверного кода (route handlers, cron, server components).
let adminCache: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  if (!adminCache) {
    adminCache = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminCache;
}
