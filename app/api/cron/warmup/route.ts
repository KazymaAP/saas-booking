// app/api/cron/warmup/route.ts — лёгкий «ping» базы, чтобы проект Supabase (free-тариф) не засыпал.
// Суть проблемы: на бесплатном тарифе Supabase «засыпает» после простоя и просыпается ~20 с — из-за этого
// первый посетитель публичной страницы бьётся о холодную БД. Внешний шедулер, дёргающий этот эндпоинт
// каждые 5 минут (UptimeRobot / pg_cron_http / crontab VPS), держит соединение в тепле: просыпаться не нужно.
// Авторизация — Bearer CRON_SECRET (общая с остальными cron, см. lib/cron.ts).
import { cronRoute } from '@/lib/cron-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const GET = cronRoute('warmup');
