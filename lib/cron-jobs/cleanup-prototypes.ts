// lib/cron-jobs/cleanup-prototypes.ts — очистка прототипов (ТЗ §11.5): preview_ready > 90 дней → archived,
// archived > 30 дней → удаление вместе с фото (outreach_log и audit_log сохраняются).
// Поля archived_at в схеме нет, поэтому момент архивации хранится в cron_marks (job cleanup-prototypes, key = id).
// Удаляются ТОЛЬКО бизнесы, заархивированные этой задачей: бывшие клиенты и отказники в archived не трогаются
// (раньше удалялись все archived с created_at > 120 дней — потеря данных). Если бизнес вернули из архива,
// его отметка снимается, и удалять его никто не будет.
import type { CronContext, CronResult } from '../cron';
import { removeBusinesses } from './business-removal';
import { BATCH_SIZE, DAY_MS, claimKeys, isoAgo, releaseKeys, unwrapRows } from './shared';

export const JOB = 'cleanup-prototypes';
export const PROTOTYPE_TTL_DAYS = 90;
export const ARCHIVE_TTL_DAYS = 30;

async function archiveStale(ctx: CronContext): Promise<number> {
  const stale = unwrapRows<{ id: string }>(await ctx.db.from('businesses').select('id')
    .eq('status', 'preview_ready').lt('created_at', isoAgo(ctx.now, PROTOTYPE_TTL_DAYS * DAY_MS))
    .order('created_at', { ascending: true }).limit(BATCH_SIZE), `${JOB}: выборка прототипов`);
  if (stale.length === 0) return 0;
  const archived = unwrapRows<{ id: string }>(await ctx.db.from('businesses').update({ status: 'archived' })
    .in('id', stale.map((b) => b.id)).eq('status', 'preview_ready').select('id'), `${JOB}: архивация`);
  // Отметка ставится после UPDATE: если она не запишется, бизнес останется в архиве навсегда — безопасная сторона.
  await claimKeys(ctx, JOB, archived.map((b) => b.id));
  return archived.length;
}

async function deleteExpired(ctx: CronContext): Promise<{ deleted: number; failed: number; restored: number }> {
  const marks = unwrapRows<{ key: string }>(await ctx.db.from('cron_marks').select('key')
    .eq('job', JOB).lt('created_at', isoAgo(ctx.now, ARCHIVE_TTL_DAYS * DAY_MS))
    .order('created_at', { ascending: true }).limit(BATCH_SIZE), `${JOB}: выборка архива`);
  const ids = marks.map((m) => m.key);
  const { deleted, failed } = await removeBusinesses(ctx, JOB, ids, 'archived');
  // Удалённые и восстановленные (статус уже не archived или бизнеса нет) — отметка больше не нужна.
  const keep = new Set(failed);
  const done = ids.filter((id) => keep.has(id) === false);
  await releaseKeys(ctx, JOB, done);
  return { deleted: deleted.length, failed: failed.length, restored: done.length - deleted.length };
}

export async function cleanupPrototypes(ctx: CronContext): Promise<CronResult> {
  // Сначала удаление: архивированные в этом же запуске ещё не прожили 30 дней и в выборку не попадут.
  const removal = await deleteExpired(ctx);
  const archived = await archiveStale(ctx);
  return { archived, ...removal };
}
