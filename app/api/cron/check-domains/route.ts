// app/api/cron/check-domains/route.ts — cron-задача check-domains. Логика — lib/cron-jobs/check-domains.ts, расписание — lib/schedules.ts.
// Авторизация (Bearer CRON_SECRET), блокировка, журнал и 500 + logError — в lib/cron.ts → runCronJob.
import { cronRoute } from '@/lib/cron-jobs';

export const runtime = 'nodejs';
// Vercel Hobby: максимум 60 с; задача останавливается по ctx.deadline раньше.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export const GET = cronRoute('check-domains');
