// lib/booking-actions.ts — отмена и перенос брони по токену (ТЗ §10.4, §10.5). Только сервер.
// Одна реализация для API (app/api/bookings/[token]/*) и server actions страниц — без дублирования.
//
// Идемпотентность и гонки:
// - бронь и бизнес читаются одним запросом (join по FK), индекс — unique cancel_token;
// - UPDATE условный (compare-and-swap по статусу и времени): двойное нажатие / параллельные запросы
//   меняют строку ровно один раз, уведомление бизнесу уходит ровно один раз;
// - повторная отмена → { ok: true, already: true }; повторный перенос на то же время → { already: true }.
import { z } from 'zod';
import { adminClient } from './supabase';
import { ACTIVE_STATUSES, businessTimeZone, freeSlotsFor } from './availability';
import { localDateOf } from './slots';
import { notifyChanged } from './booking-notify';
import { audit } from './audit';
import { logError } from './log';
import type { CancelResponse, RescheduleInput, RescheduleResponse } from './schemas';
import type { Failure } from './booking-http';

const HOUR_MS = 3_600_000;
const DEFAULT_CANCEL_HOURS = 3; // ТЗ §4.6 cancel_hours_before DEFAULT 3
const DEFAULT_MAX_RESCHEDULES = 1; // ТЗ §4.6 max_reschedules DEFAULT 1
const DEFAULT_DURATION_MINUTES = 60;
const SLOT_CONFLICT_CODES = new Set(['23505', '23P01']);
const MISSING_COLUMN_CODES = new Set(['PGRST204', '42703']);
const RESCHEDULE_AUDIT_ACTION = 'booking_rescheduled';

const nullableInt = z.number().int().nullable().optional();

// Строка брони с бизнесом и услугой. Поля новой схемы (ТЗ §4.6/4.7/4.10) опциональны.
const TokenBookingRow = z.object({
  id: z.string(),
  business_id: z.string(),
  status: z.string(),
  scheduled_at: z.string(),
  service_id: z.string().nullable().optional(),
  reschedule_count: nullableInt,
  duration_at_booking: nullableInt,
  services: z
    .object({ name: z.string().nullable().optional(), duration_minutes: nullableInt, buffer_before: nullableInt, buffer_after: nullableInt })
    .nullable()
    .optional(),
  businesses: z.object({
    id: z.string(),
    slug: z.string().optional(),
    name: z.string(),
    phones: z.array(z.string()).nullable().optional(),
    cancel_hours_before: nullableInt,
    max_reschedules: nullableInt,
    timezone: z.string().nullable().optional(),
    working_hours: z.record(z.array(z.object({ open: z.string(), close: z.string() })).nullable()).nullable(),
    slot_step_minutes: z.number().int(),
    min_hours_before: z.number().int(),
    max_days_ahead: z.number().int(),
  }),
});
export type TokenBooking = z.infer<typeof TokenBookingRow>;

export type ActionResult<T> = { ok: true; value: T } | { ok: false; failure: Failure };

const failure = <T>(value: Failure): ActionResult<T> => ({ ok: false, failure: value });
const success = <T>(value: T): ActionResult<T> => ({ ok: true, value });

// Бронь по токену. null — не найдена (или токен не нашего формата — проверяет вызывающий через zod).
export async function bookingByToken(token: string): Promise<TokenBooking | null> {
  const { data, error } = await adminClient()
    .from('bookings')
    .select('*, services(*), businesses(*)')
    .eq('cancel_token', token)
    .maybeSingle();
  if (error) throw new Error(`bookingByToken: ${error.code ?? ''} ${error.message}`);
  if (data === null) return null;
  const parsed = TokenBookingRow.safeParse(data);
  if (parsed.success === false) throw new Error(`bookingByToken: неожиданная строка ${parsed.error.issues[0]?.path.join('.')}`);
  return parsed.data;
}

export function isActive(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function cancelHoursBefore(booking: TokenBooking): number {
  return booking.businesses.cancel_hours_before ?? DEFAULT_CANCEL_HOURS;
}

export function maxReschedules(booking: TokenBooking): number {
  return booking.businesses.max_reschedules ?? DEFAULT_MAX_RESCHEDULES;
}

export function businessPhone(booking: TokenBooking): string | null {
  return booking.businesses.phones?.[0] ?? null;
}

// Можно ли ещё отменить/перенести онлайн: до начала не меньше cancel_hours_before часов (ТЗ §10.4, §10.5).
// Сравнение в абсолютном времени (epoch ms) — от часового пояса не зависит.
export function withinCancelWindow(booking: TokenBooking, nowMs: number = Date.now()): boolean {
  return Date.parse(booking.scheduled_at) - nowMs >= cancelHoursBefore(booking) * HOUR_MS;
}

function tooLate(booking: TokenBooking): Failure {
  return { reason: 'too_late', phone: businessPhone(booking) };
}

// Сколько раз бронь уже переносили: колонка reschedule_count (ТЗ §4.10) или, на старой схеме, audit_log.
export async function rescheduleCount(booking: TokenBooking): Promise<number> {
  if (typeof booking.reschedule_count === 'number') return booking.reschedule_count;
  const { count, error } = await adminClient()
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('action', RESCHEDULE_AUDIT_ACTION)
    .eq('entity_id', booking.id);
  if (error) throw new Error(`rescheduleCount: ${error.message}`);
  return count ?? 0;
}

async function auditSafe(action: string, bookingId: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await audit(action, 'booking', bookingId, payload);
  } catch (error) {
    await logError('booking', 'audit_failed', { action, error: error instanceof Error ? error.message : String(error) });
  }
}

// ---------- Отмена ----------

export async function cancelBooking(token: string, nowMs: number = Date.now()): Promise<ActionResult<CancelResponse>> {
  const booking = await bookingByToken(token);
  if (booking === null) return failure({ reason: 'not_found' });
  if (booking.status === 'cancelled') return success({ ok: true, status: 'cancelled', already: true });
  if (isActive(booking.status) === false) return failure({ reason: 'not_cancellable' });
  if (withinCancelWindow(booking, nowMs) === false) return failure(tooLate(booking));

  const { data, error } = await adminClient()
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date(nowMs).toISOString(), cancelled_by: 'client' })
    .eq('id', booking.id)
    .in('status', [...ACTIVE_STATUSES])
    .select('id');
  if (error) throw new Error(`cancel update: ${error.code ?? ''} ${error.message}`);
  // 0 строк — конкурентный запрос отменил раньше: результат тот же, уведомление уже ушло.
  if ((data?.length ?? 0) === 0) return success({ ok: true, status: 'cancelled', already: true });

  await Promise.all([
    notifyChanged(booking.business_id, 'cancel', booking.id),
    auditSafe('booking_cancelled', booking.id, { business: booking.business_id, by: 'client' }),
  ]);
  return success({ ok: true, status: 'cancelled' });
}

// ---------- Перенос ----------

function durationOf(booking: TokenBooking): number {
  return booking.duration_at_booking ?? booking.services?.duration_minutes ?? DEFAULT_DURATION_MINUTES;
}

type UpdateOutcome = 'updated' | 'raced' | 'conflict';

// Условный UPDATE: строка меняется, только если время и статус те же, что мы прочитали.
async function moveBooking(booking: TokenBooking, startsAtIso: string, count: number): Promise<UpdateOutcome> {
  const patch = { scheduled_at: startsAtIso, reminder_24h_sent_at: null, reminder_2h_sent_at: null };
  const run = (extra: Record<string, unknown>) =>
    adminClient()
      .from('bookings')
      .update({ ...patch, ...extra })
      .eq('id', booking.id)
      .eq('scheduled_at', booking.scheduled_at)
      .in('status', [...ACTIVE_STATUSES])
      .select('id');
  let res = await run({ reschedule_count: count + 1 });
  if (res.error && MISSING_COLUMN_CODES.has(res.error.code ?? '')) res = await run({});
  if (res.error) {
    if (SLOT_CONFLICT_CODES.has(res.error.code ?? '')) return 'conflict';
    throw new Error(`reschedule update: ${res.error.code ?? ''} ${res.error.message}`);
  }
  return (res.data?.length ?? 0) > 0 ? 'updated' : 'raced';
}

// Проверки без БД: статус, окно отмены, согласованность даты и времени. null — можно продолжать.
function rescheduleStaticBlocker(booking: TokenBooking, input: RescheduleInput, nowMs: number): Failure | null {
  if (isActive(booking.status) === false) return { reason: 'not_reschedulable' };
  if (withinCancelWindow(booking, nowMs) === false) return tooLate(booking);
  const timeZone = businessTimeZone(booking.businesses);
  if (localDateOf(Date.parse(input.startsAt), timeZone) !== input.date) return { reason: 'validation', field: 'startsAt' };
  return null;
}

// Свободен ли новый слот (без учёта самой переносимой брони).
async function slotBlocker(booking: TokenBooking, input: RescheduleInput, nowMs: number): Promise<Failure | null> {
  const timing = {
    duration_minutes: durationOf(booking),
    buffer_before: booking.services?.buffer_before ?? 0,
    buffer_after: booking.services?.buffer_after ?? 0,
  };
  const free = await freeSlotsFor(booking.businesses, timing, input.date, { excludeBookingId: booking.id, nowMs });
  return free.includes(Date.parse(input.startsAt)) ? null : { reason: 'slot_taken' };
}

export async function rescheduleBooking(
  token: string,
  input: RescheduleInput,
  nowMs: number = Date.now(),
): Promise<ActionResult<RescheduleResponse>> {
  const booking = await bookingByToken(token);
  if (booking === null) return failure({ reason: 'not_found' });
  const startsAtIso = new Date(input.startsAt).toISOString();
  // Повтор того же запроса (двойной клик, ретрай сети) — уже перенесено, ничего не меняем.
  if (isActive(booking.status) && Date.parse(booking.scheduled_at) === Date.parse(startsAtIso)) {
    return success({ ok: true, status: statusOf(booking.status), startsAt: startsAtIso, already: true });
  }

  const staticBlocker = rescheduleStaticBlocker(booking, input, nowMs);
  if (staticBlocker !== null) return failure(staticBlocker);
  // Счётчик переносов и слоты независимы — параллельно.
  const [count, busyBlocker] = await Promise.all([rescheduleCount(booking), slotBlocker(booking, input, nowMs)]);
  if (count >= maxReschedules(booking)) return failure({ reason: 'reschedule_limit', phone: businessPhone(booking) });
  if (busyBlocker !== null) return failure(busyBlocker);

  const outcome = await moveBooking(booking, startsAtIso, count);
  if (outcome === 'conflict') return failure({ reason: 'slot_taken' });
  if (outcome === 'raced') return failure({ reason: 'not_reschedulable' });

  await Promise.all([
    notifyChanged(booking.business_id, 'reschedule', booking.id),
    auditSafe(RESCHEDULE_AUDIT_ACTION, booking.id, { business: booking.business_id, from: booking.scheduled_at, to: startsAtIso }),
  ]);
  return success({ ok: true, status: statusOf(booking.status), startsAt: startsAtIso });
}

function statusOf(status: string): RescheduleResponse['status'] {
  return status === 'confirmed' ? 'confirmed' : 'new';
}
