// lib/cron-jobs/index.ts — реестр хендлеров cron (JOBS). Имя задачи = сегмент URL /api/cron/<name> = name в lib/schedules.ts.
// send-emails и check-replies (агент 8) — отдельные маршруты со своей логикой, здесь их нет.
import { jsonResponse, requireCron, runCronJob, type CronContext, type CronHandler } from '../cron';
import { makeCronContext } from '../cron-context';
import { archiveRefused } from './archive-refused';
import { backup } from './backup';
import { bookingReminders } from './booking-reminders';
import { checkDomains } from './check-domains';
import { cleanupAuditLog } from './cleanup-audit-log';
import { cleanupPrototypes } from './cleanup-prototypes';
import { followUp } from './follow-up';
import { processDeletions } from './process-deletions';
import { processTransfers } from './process-transfers';
import { resetEmailLimits } from './reset-email-limits';
import { subscriptionReminders } from './subscription-reminders';
import { unconfirmedReminder } from './unconfirmed-reminder';
import { warmup } from './warmup';

// Слоты не хранятся в БД (считаются на лету в lib/availability.ts). URL оставлен для совместимости, в расписаниях его нет.
const cleanupSlots: CronHandler = () => Promise.resolve({ skipped: 'слоты не хранятся, очистка не требуется' });

export const JOBS = {
  'archive-refused': archiveRefused,
  backup,
  'booking-reminders': bookingReminders,
  'check-domains': checkDomains,
  'cleanup-audit-log': cleanupAuditLog,
  'cleanup-prototypes': cleanupPrototypes,
  'cleanup-slots': cleanupSlots,
  'follow-up': followUp,
  'process-deletions': processDeletions,
  'process-transfers': processTransfers,
  'reset-email-limits': resetEmailLimits,
  'subscription-reminders': subscriptionReminders,
  'unconfirmed-reminder': unconfirmedReminder,
  warmup,
} as const satisfies Record<string, CronHandler>;

export type JobName = keyof typeof JOBS;

export function isJobName(name: string): name is JobName {
  return Object.prototype.hasOwnProperty.call(JOBS, name);
}

const HTTP_NOT_FOUND = 404;

export interface CronRouteDeps {
  makeContext?: () => CronContext;
}

// Выполняет задачу по имени. Порядок: 401 (секрет) → 404 (неизвестная задача) → runCronJob.
// Секрет проверяется до имени, чтобы без CRON_SECRET нельзя было перебором узнать список задач.
export function handleCronRequest(name: string, req: Request, deps: CronRouteDeps = {}): Promise<Response> {
  const denied = requireCron(req);
  if (denied !== null) return Promise.resolve(denied);
  if (isJobName(name) === false) {
    return Promise.resolve(jsonResponse({ ok: false, job: name, reason: 'unknown_job' }, HTTP_NOT_FOUND));
  }
  return runCronJob(name, req, JOBS[name], deps.makeContext ?? makeCronContext);
}

// GET-обработчик для отдельного маршрута app/api/cron/<name>/route.ts.
export function cronRoute(name: JobName): (req: Request) => Promise<Response> {
  return function cronGet(req: Request): Promise<Response> {
    return handleCronRequest(name, req);
  };
}
