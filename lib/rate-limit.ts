// lib/rate-limit.ts — лимит запросов в Postgres (ТЗ §0.3: rate limit в Postgres, см. DECISIONS.md).
// Окно фиксированное: bucket хранит window_start и число попаданий.
import { adminClient } from './supabase';

export async function hitRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = adminClient();
  const now = new Date();
  const { data } = await db.from('rate_limits').select('*').eq('bucket', bucket).maybeSingle();

  const windowStart = data ? new Date(data.window_start) : null;
  const expired = !windowStart || now.getTime() - windowStart.getTime() >= windowSeconds * 1000;

  if (expired) {
    await db.from('rate_limits').upsert({ bucket, window_start: now.toISOString(), hits: 1 });
    return true;
  }
  if (data.hits >= limit) return false;

  await db.from('rate_limits').update({ hits: data.hits + 1 }).eq('bucket', bucket);
  return true;
}
