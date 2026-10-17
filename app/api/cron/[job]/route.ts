// app/api/cron/[job]/route.ts — универсальный маршрут cron: /api/cron/<job>. Реестр хендлеров — lib/cron-jobs (JOBS),
// расписания — lib/schedules.ts. Порядок: 401 без Bearer CRON_SECRET → 404 для неизвестной задачи →
// блокировка от параллельного запуска → хендлер → журнал (audit_log cron:<job>) → 500 + logError('cron') при ошибке.
// Статические маршруты (app/api/cron/<job>/route.ts) имеют приоритет над [job] — это те же хендлеры.
import { handleCronRequest } from '@/lib/cron-jobs';

export const runtime = 'nodejs';
// Vercel Hobby: максимум 60 с. Хендлеры сами останавливаются по ctx.deadline (CRON_BUDGET_MS = 50 с).
export const maxDuration = 60;
// Ответ cron никогда не кэшируется.
export const dynamic = 'force-dynamic';

export function GET(req: Request, { params }: { params: { job: string } }): Promise<Response> {
  return handleCronRequest(params.job, req);
}
