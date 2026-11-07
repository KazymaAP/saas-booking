// lib/cron-jobs/process-deletions.ts — удаление аккаунтов (ТЗ §3.6: pending_deletion → 30 дней → удалён).
// Дата удаления уже посчитана при запросе (businesses.deletion_scheduled_at). За запуск — до BATCH_SIZE бизнесов,
// остаток — следующие сутки. Идемпотентно: удалённого бизнеса нет в выборке, DELETE повторно проверяет статус.
import type { CronContext, CronResult } from '../cron';
import { removeBusinesses } from './business-removal';
import { BATCH_SIZE, unwrapRows } from './shared';

export const JOB = 'process-deletions';

export async function processDeletions(ctx: CronContext): Promise<CronResult> {
  const due = unwrapRows<{ id: string }>(await ctx.db.from('businesses').select('id')
    .eq('status', 'pending_deletion').lt('deletion_scheduled_at', ctx.now.toISOString())
    .order('deletion_scheduled_at', { ascending: true }).limit(BATCH_SIZE), `${JOB}: выборка`);
  const { deleted, failed } = await removeBusinesses(ctx, JOB, due.map((b) => b.id), 'pending_deletion');
  return { due: due.length, deleted: deleted.length, failed: failed.length };
}
