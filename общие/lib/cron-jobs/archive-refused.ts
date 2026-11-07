// lib/cron-jobs/archive-refused.ts — отказы старше 30 дней → archived (ТЗ §3.6). Один UPDATE с проверкой статуса:
// повторный запуск ничего не меняет. Бизнесы в refused без refused_at не трогаем — дату отказа узнать неоткуда.
import type { CronContext, CronResult } from '../cron';
import { DAY_MS, isoAgo, unwrapRows } from './shared';

export const JOB = 'archive-refused';
export const REFUSED_KEEP_DAYS = 30;

export async function archiveRefused(ctx: CronContext): Promise<CronResult> {
  const archived = unwrapRows<{ id: string }>(await ctx.db.from('businesses').update({ status: 'archived' })
    .eq('status', 'refused').lt('refused_at', isoAgo(ctx.now, REFUSED_KEEP_DAYS * DAY_MS)).select('id'), `${JOB}: архивация`);
  return { archived: archived.length };
}
