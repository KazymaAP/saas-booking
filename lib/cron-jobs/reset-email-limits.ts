// lib/cron-jobs/reset-email-limits.ts — суточный сброс sent_today у ящиков рассылки (ТЗ §8.4, §9.1).
// Идемпотентность: сбрасываются только ящики, у которых last_reset ещё не сегодняшний. Повторный запуск в тот же
// день не обнуляет счётчик второй раз (иначе дневной лимит 50 писем на ящик можно превысить).
// День считается так же, как в lib/notify.ts → pickAccount() (UTC): две разные границы суток дали бы двойной сброс.
// Когда агент 8 переведёт pickAccount на Europe/Moscow (ТЗ: 00:00 МСК), переключить RESET_DAY_TIMEZONE на 'moscow'.
import type { CronContext, CronResult } from '../cron';
import { moscowDate, unwrapRows } from './shared';

export const JOB = 'reset-email-limits';
export const RESET_DAY_TIMEZONE: 'utc' | 'moscow' = 'utc';

export function resetDay(now: Date): string {
  if (RESET_DAY_TIMEZONE === 'moscow') return moscowDate(now);
  return now.toISOString().slice(0, 10);
}

export async function resetEmailLimits(ctx: CronContext): Promise<CronResult> {
  const today = resetDay(ctx.now);
  const patch = { sent_today: 0, last_reset: today };
  // Два запроса вместо or(): в SQL «last_reset <> today» не включает NULL.
  const stale = unwrapRows<{ id: string }>(await ctx.db.from('email_accounts').update(patch)
    .lt('last_reset', today).select('id'), `${JOB}: сброс`);
  const never = unwrapRows<{ id: string }>(await ctx.db.from('email_accounts').update(patch)
    .is('last_reset', null).select('id'), `${JOB}: сброс новых`);
  return { reset: stale.length + never.length, day: today };
}
