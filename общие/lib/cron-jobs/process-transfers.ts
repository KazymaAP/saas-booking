// lib/cron-jobs/process-transfers.ts — выкуп кода (ТЗ §14.4): support_until = передача + 30 дней.
// После support_until сайт уходит на заглушку (subscription_active=false), ещё через 7 дней — статус transferred_out.
// Оба шага — UPDATE с проверкой текущего состояния, повторный запуск ничего не меняет. Даты — по Москве.
import type { CronContext, CronResult } from '../cron';
import { moscowDate, unwrapRows } from './shared';

export const JOB = 'process-transfers';
export const TRANSFER_GRACE_DAYS = 7;

export async function processTransfers(ctx: CronContext): Promise<CronResult> {
  const today = moscowDate(ctx.now);
  const stubbed = unwrapRows<{ id: string }>(await ctx.db.from('businesses').update({ subscription_active: false })
    .not('code_transferred_at', 'is', null).lt('support_until', today).eq('subscription_active', true)
    .select('id'), `${JOB}: заглушка`);
  // Только client: pending_deletion и прочие статусы не переводим в transferred_out.
  const transferred = unwrapRows<{ id: string }>(await ctx.db.from('businesses').update({ status: 'transferred_out' })
    .not('code_transferred_at', 'is', null).lt('support_until', moscowDate(ctx.now, -TRANSFER_GRACE_DAYS))
    .eq('status', 'client').select('id'), `${JOB}: transferred_out`);
  return { stubbed: stubbed.length, transferred_out: transferred.length };
}
