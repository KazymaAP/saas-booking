// lib/cron-jobs/business-removal.ts — удаление бизнесов вместе с фото в Storage (process-deletions, cleanup-prototypes).
// Порядок: сначала файлы в bucket photos, потом строка businesses (photos удаляются каскадом, outreach_log и audit_log
// сохраняются — 0002_lifecycle.sql, ТЗ §11.5). Если Storage не ответил — бизнес не удаляется в этом запуске:
// иначе файлы останутся без владельца навсегда. Повтор — следующий запуск (задача идемпотентна).
import type { CronContext } from '../cron';
import type { BusinessStatus, Photo } from '../database.types';
import { chunk, unwrapRows } from './shared';

export const PHOTOS_BUCKET = 'photos';
// Storage API принимает ограниченный список путей за вызов; 100 — с запасом.
const STORAGE_REMOVE_CHUNK = 100;

export interface RemovalResult {
  deleted: string[];
  failed: string[];
}

type PhotoPath = Pick<Photo, 'business_id' | 'path'>;

// Удаляет файлы одного бизнеса. true — файлов нет или все удалены.
async function removeFiles(ctx: CronContext, job: string, paths: string[]): Promise<boolean> {
  for (const part of chunk(paths, STORAGE_REMOVE_CHUNK)) {
    const { error } = await ctx.db.storage.from(PHOTOS_BUCKET).remove(part);
    if (error !== null) {
      await ctx.log.error(`storage remove: ${error.message}`, { job, files: part.length });
      return false;
    }
  }
  return true;
}

// expectedStatus — повторная проверка статуса в самом DELETE: бизнес, который успели восстановить, не удалится.
export async function removeBusinesses(
  ctx: CronContext,
  job: string,
  ids: string[],
  expectedStatus: BusinessStatus,
): Promise<RemovalResult> {
  if (ids.length === 0) return { deleted: [], failed: [] };
  const photos = unwrapRows<PhotoPath>(await ctx.db.from('photos').select('business_id, path').in('business_id', ids), `${job}: фото`);

  const ready: string[] = [];
  const failed: string[] = [];
  for (const id of ids) {
    const paths = photos.filter((p) => p.business_id === id && p.path !== null && p.path !== '').map((p) => p.path ?? '');
    if (await removeFiles(ctx, job, paths)) ready.push(id);
    else failed.push(id);
  }
  if (ready.length === 0) return { deleted: [], failed };

  const deleted = unwrapRows<{ id: string }>(await ctx.db.from('businesses').delete()
    .in('id', ready).eq('status', expectedStatus).select('id'), `${job}: удаление`);
  return { deleted: deleted.map((row) => row.id), failed };
}
