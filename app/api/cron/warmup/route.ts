// app/api/cron/warmup/route.ts — лёгкий «ping» базы, чтобы проект Supabase (free-тариф) не засыпал.
// Суть проблемы: на бесплатном тарифе Supabase «засыпает» после простоя и просыпается ~20 с — из-за этого
// первый посетитель публичной страницы бьётся о холодную БД. Внешний шедулер, дёргающий этот эндпоинт
// каждые 5 минут (UptimeRobot / pg_cron_http / crontab VPS), держит соединение в тепле: просыпаться не нужно.
// Авторизация — Bearer CRON_SECRET (общая с остальными cron, см. lib/cron.ts).
import { requireCron, jsonResponse } from '@/lib/cron';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request): Promise<Response> {
  const denied = requireCron(req);
  if (denied !== null) return denied;
  try {
    // Минимальный запрос: count по колонке id, без head/limit (head:true иногда отдаёт count:null
    // в зависимости от версии supabase-js / PostgREST). Только «дыхание» соединения с БД.
    const { count, error } = await adminClient()
      .from('businesses')
      .select('id', { count: 'exact' });
    if (error) {
      return jsonResponse({ ok: false, reason: 'db_error', message: error.message }, 500);
    }
    // Диагностика: какой URL реально использует adminClient (без раскрытия ключа).
    const dbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^https?:\/\//, '');
    return jsonResponse({ ok: true, awake: true, businesses_count: count ?? 0, db: dbUrl });
  } catch (e) {
    return jsonResponse({ ok: false, reason: 'exception', message: (e as Error).message }, 500);
  }
}
