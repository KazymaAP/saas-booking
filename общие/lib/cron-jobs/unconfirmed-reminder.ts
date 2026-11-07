// lib/cron-jobs/unconfirmed-reminder.ts — письмо бизнесу о брони, висящей в статусе new дольше 24 ч (ТЗ §10.8).
// Раз в час. Идемпотентность: public.cron_claim_unconfirmed() одним запросом выбирает и захватывает брони
// (cron_marks, ключ = id брони) — одна бронь получает одно напоминание. При сбое письма ключ освобождается.
import type { CronContext, CronResult } from '../cron';
import type { Booking, Business } from '../database.types';
import {
  BATCH_SIZE, firstEmail, formatMoscow, releaseKeys, safeSendMail, safeSendTelegram, unwrapRows, withClaimedKeys,
} from './shared';

export const JOB = 'unconfirmed-reminder';

type PendingBooking = Pick<Booking, 'id' | 'business_id' | 'scheduled_at' | 'status'>;
type OwnerBusiness = Pick<Business, 'id' | 'name' | 'emails' | 'telegram_chat_id'>;

export function unconfirmedText(business: OwnerBusiness, bookings: PendingBooking[]): string {
  const lines = bookings.map((b) => `• ${formatMoscow(b.scheduled_at)}`);
  return `${business.name}: ${bookings.length} брон. ждут подтверждения больше суток.\n${lines.join('\n')}\n`
    + 'Подтвердите или отмените их в кабинете, иначе клиент не узнает, ждать ли его.';
}

// Одно письмо на бизнес со всеми его висящими бронями — меньше писем и меньше расход лимита ящиков.
// no_contact — ни email, ни Telegram: повторять бессмысленно, отметка остаётся.
async function notifyBusiness(ctx: CronContext, business: OwnerBusiness, bookings: PendingBooking[]): Promise<'sent' | 'failed' | 'no_contact'> {
  const text = unconfirmedText(business, bookings);
  const email = firstEmail(business.emails);
  const hasTelegram = business.telegram_chat_id !== null && business.telegram_chat_id !== '';
  if (email === null && hasTelegram === false) return 'no_contact';
  const mailed = email === null ? false : (await safeSendMail(ctx, JOB, { to: email, subject: 'Брони ждут подтверждения', text })) === 'sent';
  const telegram = await safeSendTelegram(ctx, JOB, business.telegram_chat_id, text);
  return mailed || telegram ? 'sent' : 'failed';
}

async function notifyClaimed(ctx: CronContext, ids: string[]): Promise<CronResult> {
  const bookings = unwrapRows<PendingBooking>(await ctx.db.from('bookings')
    .select('id, business_id, scheduled_at, status').in('id', ids), `${JOB}: брони`);
  // Бронь могли подтвердить между захватом и чтением — такие пропускаем, отметка остаётся (напоминать уже не нужно).
  const pending = bookings.filter((b) => b.status === 'new');
  const businessIds = [...new Set(pending.map((b) => b.business_id))];
  const businesses = businessIds.length === 0 ? [] : unwrapRows<OwnerBusiness>(await ctx.db.from('businesses')
    .select('id, name, emails, telegram_chat_id').in('id', businessIds), `${JOB}: бизнесы`);

  let notified = 0;
  let noContact = 0;
  const failedKeys: string[] = [];
  for (const business of businesses) {
    const own = pending.filter((b) => b.business_id === business.id);
    const outcome = await notifyBusiness(ctx, business, own);
    if (outcome === 'sent') notified += 1;
    else if (outcome === 'no_contact') noContact += 1;
    else failedKeys.push(...own.map((b) => b.id));
  }
  // Сбой отправки — освобождаем ключи, следующий запуск (через час) попробует снова.
  await releaseKeys(ctx, JOB, failedKeys);
  return { claimed: ids.length, businesses: businesses.length, notified, no_contact: noContact, failed: failedKeys.length };
}

export async function unconfirmedReminder(ctx: CronContext): Promise<CronResult> {
  const ids = unwrapRows<string>(await ctx.db.rpc('cron_claim_unconfirmed', { p_limit: BATCH_SIZE }), `${JOB}: захват`);
  if (ids.length === 0) return { claimed: 0, businesses: 0, notified: 0, no_contact: 0, failed: 0 };
  return withClaimedKeys(ctx, JOB, ids, () => notifyClaimed(ctx, ids));
}
