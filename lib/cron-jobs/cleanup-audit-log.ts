// lib/cron-jobs/cleanup-audit-log.ts — страховочная очистка журналов (Vercel Cron, 06:00 UTC).
// Основная очистка — pg_cron (0007_retention.sql). Если pg_cron выключен или Supabase не выполнил задачу,
// эта задача вызывает ту же SQL-функцию public.cron_retention(table): сроки берутся из cron_retention_policy,
// повторный или параллельный вызов безопасен (advisory-lock внутри функции, удаляются только старые строки).
import type { CronContext, CronResult } from '../cron';
import { RETENTION_DAYS } from '../schedules';
import { unwrap } from './shared';

export const JOB = 'cleanup-audit-log';
export const RETENTION_TABLES = [...Object.keys(RETENTION_DAYS), 'cron_marks'] as const;

export async function cleanupAuditLog(ctx: CronContext): Promise<CronResult> {
  const result: CronResult = {};
  const failed: string[] = [];
  // Последовательно: каждая очистка — тяжёлый DELETE, параллельно они мешают друг другу.
  // Сбой одной таблицы не останавливает остальные; в конце — исключение со списком (→ 500 + logError).
  for (const table of RETENTION_TABLES) {
    const response = await ctx.db.rpc('cron_retention', { p_table: table });
    if (response.error !== null) {
      failed.push(`${table}: ${response.error.message}`);
      continue;
    }
    // null — функция поймала ошибку внутри SQL и уже записала её в audit_log (error:cron).
    const deleted = unwrap<number | null>(response, `${JOB}: ${table}`);
    result[table] = deleted;
    if (deleted === null) failed.push(`${table}: ошибка внутри cron_retention`);
  }
  if (failed.length > 0) throw new Error(`${JOB}: ${failed.join('; ')}`);
  return result;
}
