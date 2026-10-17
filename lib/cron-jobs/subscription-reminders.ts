// lib/cron-jobs/subscription-reminders.ts — подписка (ТЗ §14.3): за 3 дня до конца — письмо, в день окончания — письмо,
// через 7 дней просрочки — заглушка (subscription_active=false), через 30 — archived. Даты — по Москве.
// Идемпотентность: ключ '<business>:<subscription_until>:<kind>' в cron_marks. Каждое письмо уходит один раз
// за период подписки (раньше письмо уходило каждый день, пока до конца оставалось ≤ 3 дней). Продление меняет
// subscription_until → новый ключ → новое напоминание. Пропущенный запуск не теряет письмо: «за 3 дня» уйдёт
// в любой из дней [конец-3, конец-1], «в день» — в день окончания.
import type { CronContext, CronResult } from '../cron';
import type { Business } from '../database.types';
import {
  claimKeys, firstEmail, hasTimeLeft, moscowDate, releaseKeys, safeSendMail, unwrapRows, withClaimedKeys,
} from './shared';

export const JOB = 'subscription-reminders';
export const REMIND_DAYS_BEFORE = 3;
export const STUB_AFTER_DAYS = 7;
export const ARCHIVE_AFTER_DAYS = 30;
// Платящих клиентов немного; предел защищает от неограниченной выборки.
const MAX_CANDIDATES = 200;

type SubscriptionBusiness = Pick<Business, 'id' | 'name' | 'emails' | 'subscription_until'>;
export type ReminderKind = 'soon' | 'due';

export function reminderKind(until: string, today: string): ReminderKind {
  return until === today ? 'due' : 'soon';
}

export function subscriptionText(business: SubscriptionBusiness, kind: ReminderKind): string {
  if (kind === 'due') return `Подписка для «${business.name}» заканчивается сегодня. Продлите её, чтобы сайт продолжал работать.`;
  return `Подписка для «${business.name}» заканчивается ${business.subscription_until ?? ''}. Продлите её, чтобы сайт продолжал работать.`;
}

async function sendReminders(ctx: CronContext, today: string): Promise<{ sent: number; failed: number; no_email: number }> {
  const candidates = unwrapRows<SubscriptionBusiness>(await ctx.db.from('businesses')
    .select('id, name, emails, subscription_until').eq('status', 'client').eq('subscription_active', true)
    .is('code_transferred_at', null).gte('subscription_until', today).lte('subscription_until', moscowDate(ctx.now, REMIND_DAYS_BEFORE))
    .order('subscription_until', { ascending: true }).limit(MAX_CANDIDATES), `${JOB}: выборка`);
  const withEmail = candidates.filter((b) => firstEmail(b.emails) !== null && b.subscription_until !== null);
  const keyOf = (b: SubscriptionBusiness) => `${b.id}:${b.subscription_until ?? ''}:${reminderKind(b.subscription_until ?? '', today)}`;
  const claimed = await claimKeys(ctx, JOB, withEmail.map(keyOf));
  return withClaimedKeys(ctx, JOB, [...claimed], () => sendClaimed(ctx, withEmail, claimed, keyOf, today, candidates.length));
}

async function sendClaimed(
  ctx: CronContext,
  withEmail: SubscriptionBusiness[],
  claimed: Set<string>,
  keyOf: (b: SubscriptionBusiness) => string,
  today: string,
  total: number,
): Promise<{ sent: number; failed: number; no_email: number }> {
  let sent = 0;
  const retry: string[] = [];
  for (const business of withEmail) {
    const key = keyOf(business);
    if (claimed.has(key) === false) continue;
    // Время вышло — ключ освобождаем, письмо уйдёт завтра (или в следующий запуск).
    if (hasTimeLeft(ctx) === false) {
      retry.push(key);
      continue;
    }
    const kind = reminderKind(business.subscription_until ?? '', today);
    const to = firstEmail(business.emails) ?? '';
    const outcome = await safeSendMail(ctx, JOB, { to, subject: 'Продление подписки', text: subscriptionText(business, kind) });
    if (outcome === 'sent') sent += 1;
    else retry.push(key);
  }
  await releaseKeys(ctx, JOB, retry);
  return { sent, failed: retry.length, no_email: total - withEmail.length };
}

export async function subscriptionReminders(ctx: CronContext): Promise<CronResult> {
  const today = moscowDate(ctx.now);
  const reminders = await sendReminders(ctx, today);
  // Заглушка и архив — UPDATE с проверкой текущего состояния: повторный запуск ничего не меняет.
  // Выкупившие код (code_transferred_at) ведёт process-transfers (§14.4): им не шлём «продлите подписку»
  // и не архивируем — иначе они не дойдут до transferred_out.
  const stubbed = unwrapRows<{ id: string }>(await ctx.db.from('businesses').update({ subscription_active: false })
    .eq('status', 'client').eq('subscription_active', true).is('code_transferred_at', null)
    .lt('subscription_until', moscowDate(ctx.now, -STUB_AFTER_DAYS)).select('id'), `${JOB}: заглушка`);
  const archived = unwrapRows<{ id: string }>(await ctx.db.from('businesses').update({ status: 'archived' })
    .eq('status', 'client').is('code_transferred_at', null).lt('subscription_until', moscowDate(ctx.now, -ARCHIVE_AFTER_DAYS))
    .select('id'), `${JOB}: архив`);
  return { ...reminders, stubbed: stubbed.length, archived: archived.length };
}
