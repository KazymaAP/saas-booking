// lib/cron-context.ts — боевой контекст cron-задач: service_role клиент, отправка писем/Telegram, журнал.
// Отделён от lib/cron.ts, чтобы тесты подменяли зависимости без моков модулей.
import { adminClient } from './supabase';
import { sendMail, sendTelegram } from './notify';
import { notifyAdmin } from './admin-notify';
import { logError } from './log';
import { SITE_URL } from './site';
import type { CronContext, CronLogger, CronValue } from './cron';

// Vercel Hobby: функция живёт до 60 с; оставляем запас на запись журнала и ответ.
export const CRON_BUDGET_MS = 50_000;

const cronLogger: CronLogger = {
  async error(message: string, payload: Record<string, CronValue>): Promise<void> {
    await logError('cron', message, payload);
  },
  async result(job: string, payload: Record<string, CronValue>): Promise<void> {
    // Итог запуска — в audit_log (таблицы app_logs из ТЗ §4.37 в схеме нет). Сбой записи журнала не роняет задачу.
    const { error } = await adminClient().from('audit_log').insert({
      user_id: null,
      action: `cron:${job}`,
      entity: 'cron',
      entity_id: null,
      payload,
    });
    if (error) await logError('cron', `журнал результата не записан: ${error.message}`, { job });
  },
};

export function makeCronContext(budgetMs: number = CRON_BUDGET_MS): CronContext {
  const now = new Date();
  return {
    db: adminClient(),
    now,
    deadline: now.getTime() + budgetMs,
    notify: { sendMail, sendTelegram, notifyAdmin },
    log: cronLogger,
    env: {
      // Адрес сервиса — одно место на проект (lib/site.ts), без собственного дефолта домена.
      siteUrl: SITE_URL,
      vercelApiToken: process.env.VERCEL_API_TOKEN ?? '',
      vercelProjectId: process.env.VERCEL_PROJECT_ID ?? '',
      vercelTeamId: process.env.VERCEL_TEAM_ID ?? '',
    },
    fetch: globalThis.fetch.bind(globalThis),
  };
}
