// lib/cron-jobs/warmup.ts — лёгкий «ping» базы, чтобы Supabase (free) не засыпал.
// Внешний шедулер дёргает /api/cron/warmup каждые 5 минут; запрос только «дышит» соединением.
import { adminClient } from '../supabase';
import type { CronHandler } from '../cron';

export const warmup: CronHandler = async () => {
  const { count, error } = await adminClient()
    .from('businesses')
    .select('id', { count: 'exact' });
  if (error) throw new Error(error.message);
  return { ok: true, awake: true, businesses_count: count ?? 0 };
};
