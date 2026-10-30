// lib/cron-jobs/cleanup-prototypes.ts — очистка прототипов (ТЗ §11.5): preview_ready > 90 дней → archived,
// archived > 30 дней → удаление вместе с фото (outreach_log и audit_log сохраняются).
// Поля archived_at в схеме нет, поэтому момент архивации хранится в cron_marks (job cleanup-prototypes, key = id).
// Бывшие клиенты (потерявшие сайт за неуплату, status='archived') НЕ удаляются — защита двухуровневая:
//  1) удаляются только бизнесы, заархивированные САМОЙ задачей (отметка в cron_marks; клиенты, ушедшие в archived
//     по подписке/вручную без отметки, не трогаются);
//  2) явный страхующий фильтр (findFormerClientIds): бизнес, у которого есть/были брони или услуги, считается
//     бывшим клиентом и никогда не удаляется (поля «был клиентом» в схеме нет — проверяем bookings/services за всё время).
// Если бизнес вернули из архива, его отметка снимается, и удалять его никто не будет.
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

// Бывшие/действующие клиенты: у бизнеса есть или когда-либо были брони либо услуги. Такие бизнесы считаются
// реальными клиентами и НИКОГДА не удаляются задачей очистки прототипов. В схеме нет поля «был клиентом»,
// поэтому опираемся на наличие записей в bookings/services за всё время (индексы idx_bookings_business_status,
// idx_services_business_active_sort уже существуют — 0005_indexes.sql).
async function findFormerClientIds(ctx: CronContext, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const booked = unwrapRows<{ business_id: string }>(
    await ctx.db.from('bookings').select('business_id').in('business_id', ids), `${JOB}: проверка броней`);
  const serviced = unwrapRows<{ business_id: string }>(
    await ctx.db.from('services').select('business_id').in('business_id', ids), `${JOB}: проверка услуг`);
  const result = new Set<string>();
  for (const row of [...booked, ...serviced]) {
    if (row.business_id !== null && row.business_id !== '') result.add(row.business_id);
  }
  return result;
}

async function deleteExpired(ctx: CronContext): Promise<{ deleted: number; failed: number; restored: number; protectedFormerClients: number }> {
  const marks = unwrapRows<{ key: string }>(await ctx.db.from('cron_marks').select('key')
    .eq('job', JOB).lt('created_at', isoAgo(ctx.now, ARCHIVE_TTL_DAYS * DAY_MS))
    .order('created_at', { ascending: true }).limit(BATCH_SIZE), `${JOB}: выборка архива`);
  const ids = marks.map((m) => m.key);
  if (ids.length === 0) return { deleted: 0, failed: 0, restored: 0, protectedFormerClients: 0 };

  // Уровень 2 (страховка): бывшие клиенты (есть/были брони или услуги) исключаются из удаления.
  // Бизнес, прошедший через реальное использование, — не прототип, даже если помечен этой задачей.
  const formerClients = await findFormerClientIds(ctx, ids);
  const safeIds = ids.filter((id) => formerClients.has(id) === false);

  const { deleted, failed } = await removeBusinesses(ctx, JOB, safeIds, 'archived');
  // Удалённые и восстановленные (статус уже не archived или бизнеса нет) — отметка больше не нужна.
  const keep = new Set(failed);
  const done = ids.filter((id) => keep.has(id) === false);
  await releaseKeys(ctx, JOB, done);
  return {
    deleted: deleted.length,
    failed: failed.length,
    restored: done.length - deleted.length,
    protectedFormerClients: ids.length - safeIds.length,
  };
}

export async function cleanupPrototypes(ctx: CronContext): Promise<CronResult> {
  // Сначала удаление: архивированные в этом же запуске ещё не прожили 30 дней и в выборку не попадут.
  const removal = await deleteExpired(ctx);
  const archived = await archiveStale(ctx);
  return { archived, ...removal };
}
