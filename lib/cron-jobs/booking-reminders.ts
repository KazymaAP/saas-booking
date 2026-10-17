// lib/cron-jobs/booking-reminders.ts — напоминания клиентам за 24 ч и за 2 ч (ТЗ §10.6, запуск раз в час).
// Окна шире часа (дерево решений агента): [now+23h, now+25h] и [now+1h, now+3h] — запуск раз в час с дрожанием
// pg_cron/pg_net не теряет брони. Дубли исключены атомарным захватом: UPDATE ... SET reminder_*_sent_at = now()
// WHERE reminder_*_sent_at IS NULL — повторный или параллельный запуск ту же бронь не получит.
// Отменённые брони не попадают в выборку (status IN new, confirmed). Неудачная отправка снимает отметку — повтор в следующий час.
import type { CronContext, CronResult } from '../cron';
import type { Booking, Business, Service } from '../database.types';
import {
  BATCH_SIZE, HOUR_MS, formatMoscow, hasTimeLeft, isoAhead, safeSendMail, safeSendTelegram, unwrapRows,
} from './shared';

export const JOB = 'booking-reminders';
const ACTIVE_STATUSES = ['new', 'confirmed'] as const;
// Сколько порций по BATCH_SIZE обрабатывается за один запуск на одно окно (верхний предел цикла).
const MAX_BATCHES_PER_WINDOW = 4;

export const REMINDER_WINDOWS = [
  { kind: '24h', column: 'reminder_24h_sent_at', fromMs: 23 * HOUR_MS, toMs: 25 * HOUR_MS },
  { kind: '2h', column: 'reminder_2h_sent_at', fromMs: 1 * HOUR_MS, toMs: 3 * HOUR_MS },
] as const;
export type ReminderWindow = (typeof REMINDER_WINDOWS)[number];

type ReminderBooking = Pick<Booking, 'id' | 'business_id' | 'service_id' | 'scheduled_at' | 'client_email'>;
type ReminderBusiness = Pick<Business, 'id' | 'name' | 'address' | 'telegram_chat_id'>;
type ReminderService = Pick<Service, 'id' | 'name'>;

interface WindowStats {
  claimed: number;
  sent: number;
  failed: number;
  no_email: number;
}

// Отбирает кандидатов и атомарно ставит отметку. Возвращает только брони, захваченные этим запуском.
async function claimBatch(ctx: CronContext, win: ReminderWindow): Promise<ReminderBooking[]> {
  const candidates = unwrapRows<Pick<Booking, 'id'>>(await ctx.db.from('bookings').select('id')
    .in('status', [...ACTIVE_STATUSES]).is(win.column, null)
    .gte('scheduled_at', isoAhead(ctx.now, win.fromMs)).lt('scheduled_at', isoAhead(ctx.now, win.toMs))
    .order('scheduled_at', { ascending: true }).limit(BATCH_SIZE), `${JOB}: выборка ${win.kind}`);
  if (candidates.length === 0) return [];
  return unwrapRows<ReminderBooking>(await ctx.db.from('bookings')
    .update({ [win.column]: ctx.now.toISOString() })
    .in('id', candidates.map((c) => c.id)).is(win.column, null).in('status', [...ACTIVE_STATUSES])
    .select('id, business_id, service_id, scheduled_at, client_email'), `${JOB}: захват ${win.kind}`);
}

async function loadLookups(ctx: CronContext, bookings: ReminderBooking[]) {
  const businessIds = [...new Set(bookings.map((b) => b.business_id))];
  const serviceIds = [...new Set(bookings.map((b) => b.service_id).filter((id): id is string => id !== null))];
  const [businesses, services] = await Promise.all([
    ctx.db.from('businesses').select('id, name, address, telegram_chat_id').in('id', businessIds),
    serviceIds.length > 0 ? ctx.db.from('services').select('id, name').in('id', serviceIds) : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    businesses: new Map(unwrapRows<ReminderBusiness>(businesses, `${JOB}: бизнесы`).map((b) => [b.id, b])),
    services: new Map(unwrapRows<ReminderService>(services, `${JOB}: услуги`).map((s) => [s.id, s])),
  };
}

export function reminderText(win: ReminderWindow, booking: ReminderBooking, business?: ReminderBusiness, service?: ReminderService): string {
  const lead = win.kind === '24h' ? 'Напоминаем: завтра у вас запись' : 'Напоминаем: через 2 часа у вас запись';
  const place = [business?.name, business?.address].filter((part) => part !== undefined && part !== null && part !== '').join(', ');
  return `${lead} — ${service?.name ?? 'услуга'}, ${formatMoscow(booking.scheduled_at)}${place === '' ? '' : `. ${place}`}.`;
}

// Снять отметку окна — бронь вернётся в выборку следующего запуска.
async function rollbackMarks(ctx: CronContext, win: ReminderWindow, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  unwrapRows(await ctx.db.from('bookings').update({ [win.column]: null }).in('id', ids).select('id'), `${JOB}: откат отметки`);
}

// Сбой БД сразу после захвата (справочники не прочитались) — отметки снимаются, иначе напоминания по этим
// броням не ушли бы никогда. Исключение пробрасывается (→ 500 + logError в runCronJob).
async function loadLookupsOrRollback(ctx: CronContext, win: ReminderWindow, bookings: ReminderBooking[]) {
  try {
    return await loadLookups(ctx, bookings);
  } catch (error) {
    await rollbackMarks(ctx, win, bookings.map((b) => b.id));
    throw error;
  }
}

async function processBatch(ctx: CronContext, win: ReminderWindow, bookings: ReminderBooking[], stats: WindowStats): Promise<void> {
  const { businesses, services } = await loadLookupsOrRollback(ctx, win, bookings);
  const failedIds: string[] = [];
  // Последовательно: sendMail выбирает ящик по счётчику sent_today, параллельная отправка обходит дневной лимит.
  for (const booking of bookings) {
    const business = businesses.get(booking.business_id);
    const text = reminderText(win, booking, business, services.get(booking.service_id ?? ''));
    const hasEmail = booking.client_email !== null && booking.client_email !== '';
    if (hasEmail === false) stats.no_email += 1;
    const outcome = hasEmail ? await safeSendMail(ctx, JOB, { to: booking.client_email ?? '', subject: 'Напоминание о записи', text }) : 'sent';
    if (outcome === 'failed') {
      failedIds.push(booking.id);
      continue;
    }
    if (hasEmail) stats.sent += 1;
    // ТЗ §18.5: бизнесу — «напоминание за час» в Telegram; ближайшее окно — 2 ч. Шлётся один раз вместе с отметкой.
    if (win.kind === '2h') await safeSendTelegram(ctx, JOB, business?.telegram_chat_id ?? null, `Скоро запись: ${text}`);
  }
  stats.failed += failedIds.length;
  await rollbackMarks(ctx, win, failedIds);
}

async function runWindow(ctx: CronContext, win: ReminderWindow): Promise<WindowStats> {
  const stats: WindowStats = { claimed: 0, sent: 0, failed: 0, no_email: 0 };
  for (let batch = 0; batch < MAX_BATCHES_PER_WINDOW && hasTimeLeft(ctx); batch++) {
    const bookings = await claimBatch(ctx, win);
    stats.claimed += bookings.length;
    if (bookings.length > 0) await processBatch(ctx, win, bookings, stats);
    // Неудачные отправки вернулись в выборку — не крутим их в том же запуске.
    if (bookings.length < BATCH_SIZE || stats.failed > 0) break;
  }
  return stats;
}

export async function bookingReminders(ctx: CronContext): Promise<CronResult> {
  const result: CronResult = {};
  // Окна обрабатываются последовательно: общий лимит отправки ящиков.
  for (const win of REMINDER_WINDOWS) {
    const stats = await runWindow(ctx, win);
    result[`claimed_${win.kind}`] = stats.claimed;
    result[`sent_${win.kind}`] = stats.sent;
    result[`failed_${win.kind}`] = stats.failed;
    result[`no_email_${win.kind}`] = stats.no_email;
  }
  return result;
}
