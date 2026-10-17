// app/api/cron/unconfirmed-reminder/route.ts — cron-задача unconfirmed-reminder. Логика — lib/cron-jobs/unconfirmed-reminder.ts, расписание — lib/schedules.ts.
// Авторизация (Bearer CRON_SECRET), блокировка, журнал и 500 + logError — в lib/cron.ts → runCronJob.
import { cronRoute } from '@/lib/cron-jobs';

export const runtime = 'nodejs';
// Vercel Hobby: максимум 60 с; задача останавливается по ctx.deadline раньше.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export const GET = cronRoute('unconfirmed-reminder');
