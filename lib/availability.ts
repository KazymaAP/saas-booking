// lib/availability.ts — единая точка расчёта доступности (слоты, создание брони, перенос). ТЗ §10.1.
// Схема БД на момент написания отстаёт от ТЗ §4.6–4.10 (нет timezone, buffer_*, duration_at_booking,
// business_holidays). Код читает эти поля, если они есть, и откатывается к дефолтам, если нет —
// поэтому работает и до, и после миграции зоны 1 (см. notes.md «Правки в других зонах»).
import { z } from 'zod';
import { adminClient } from './supabase';
import { DEFAULT_TIME_ZONE, addDays, dayBoundsUtc, freeSlots, isValidTimeZone, type BusyInterval } from './slots';
import type { Business } from './database.types';

export const ACTIVE_STATUSES = ['new', 'confirmed'] as const;
const DEFAULT_DURATION_MINUTES = 60; // если услуга удалена (service_id = null) и длительность не сохранена
const MINUTE_MS = 60_000;
// Защитный предел строк за 3 суток одного бизнеса: даже при шаге 5 минут это больше реальной загрузки.
const MAX_BUSY_ROWS = 2000;
// Коды «нет такой таблицы/колонки» в PostgREST/Postgres — признак старой схемы, а не сбоя.
const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST205', 'PGRST200', '42703']);

// Настройки бизнеса, нужные для расчёта. timezone — из ТЗ §4.6, может отсутствовать в старой схеме.
export type BusinessSchedule = Pick<Business, 'id' | 'working_hours' | 'slot_step_minutes' | 'min_hours_before' | 'max_days_ahead'> & {
  timezone?: string | null;
};

// Длительность и буферы услуги (ТЗ §4.7). buffer_* может отсутствовать в старой схеме.
export type ServiceTiming = {
  duration_minutes: number;
  buffer_before?: number | null;
  buffer_after?: number | null;
};

export type DayOptions = { excludeBookingId?: string; nowMs?: number };

const nullableInt = z.number().int().nullable().optional();

// Строка брони для занятости. Поля из ТЗ опциональны, чтобы работать на старой схеме.
const BusyRow = z.object({
  id: z.string(),
  scheduled_at: z.string(),
  duration_at_booking: nullableInt,
  services: z
    .object({ duration_minutes: z.number().int(), buffer_before: nullableInt, buffer_after: nullableInt })
    .partial()
    .nullable()
    .optional(),
});
type BusyRowT = z.infer<typeof BusyRow>;

const HolidayRow = z.object({ date: z.string() });

// Часовой пояс бизнеса: валидный IANA из БД или Москва.
export function businessTimeZone(business: Pick<BusinessSchedule, 'timezone'>): string {
  const tz = business.timezone;
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

function isMissingRelation(error: { code?: string } | null): boolean {
  return error !== null && MISSING_RELATION_CODES.has(error.code ?? '');
}

// Длительность брони: сохранённая при записи (§4.10 duration_at_booking) → текущая у услуги → 60 мин.
export function bookingDurationMinutes(row: Pick<BusyRowT, 'duration_at_booking' | 'services'>): number {
  return row.duration_at_booking ?? row.services?.duration_minutes ?? DEFAULT_DURATION_MINUTES;
}

export function toBusyInterval(row: BusyRowT): BusyInterval {
  const start = Date.parse(row.scheduled_at);
  return {
    start,
    end: start + bookingDurationMinutes(row) * MINUTE_MS,
    bufferBefore: row.services?.buffer_before ?? 0,
    bufferAfter: row.services?.buffer_after ?? 0,
  };
}

// Занятые интервалы вокруг дня date (в поясе бизнеса). Берём окно ±1 сутки: ночные интервалы
// и длинные услуги, начатые накануне, тоже блокируют слоты этого дня.
export async function busyForDay(
  businessId: string,
  date: string,
  excludeBookingId?: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<BusyInterval[]> {
  const prev = dayBoundsUtc(addDays(date, -1), timeZone);
  const next = dayBoundsUtc(addDays(date, 1), timeZone);
  if (prev === null || next === null) return [];

  // select('*') — чтобы прочитать duration_at_booking, если колонка уже есть; строк немного (один бизнес, 3 дня, лимит).
  let query = adminClient()
    .from('bookings')
    .select('*, services(*)')
    .eq('business_id', businessId)
    .in('status', [...ACTIVE_STATUSES])
    .gte('scheduled_at', new Date(prev.start).toISOString())
    .lt('scheduled_at', new Date(next.end).toISOString())
    .limit(MAX_BUSY_ROWS);
  if (excludeBookingId) query = query.neq('id', excludeBookingId);

  const { data, error } = await query;
  if (error) throw new Error(`busyForDay: ${error.code ?? ''} ${error.message}`);
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const result: BusyInterval[] = [];
  for (const raw of rows) {
    const parsed = BusyRow.safeParse(raw);
    if (parsed.success) result.push(toBusyInterval(parsed.data));
  }
  return result;
}

// Нерабочие даты бизнеса из business_holidays (ТЗ §4.9) в диапазоне [from, to].
// Таблицы может не быть в старой схеме — тогда исключений нет.
export async function holidaysBetween(businessId: string, from: string, to: string): Promise<string[]> {
  const { data, error } = await adminClient()
    .from('business_holidays')
    .select('date')
    .eq('business_id', businessId)
    .gte('date', from)
    .lte('date', to)
    .limit(MAX_BUSY_ROWS);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`holidaysBetween: ${error.code ?? ''} ${error.message}`);
  }
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.flatMap((raw) => {
    const parsed = HolidayRow.safeParse(raw);
    return parsed.success ? [parsed.data.date] : [];
  });
}

// Данные дня, нужные для расчёта: занятость и нерабочие даты.
export type DayContext = { busy: BusyInterval[]; holidays: string[] };

// Загружает занятость и выходные параллельно — один RTT к БД.
export async function loadDayContext(
  business: Pick<BusinessSchedule, 'id' | 'timezone'>,
  date: string,
  excludeBookingId?: string,
): Promise<DayContext> {
  const [busy, holidays] = await Promise.all([
    busyForDay(business.id, date, excludeBookingId, businessTimeZone(business)),
    holidaysBetween(business.id, date, date),
  ]);
  return { busy, holidays };
}

// Чистый расчёт слотов по уже загруженному дню (без БД) — для POST, где услуга грузится параллельно.
export function slotsForDay(
  business: BusinessSchedule,
  service: ServiceTiming,
  date: string,
  day: DayContext,
  nowMs: number = Date.now(),
): number[] {
  return freeSlots({
    date,
    workingHours: business.working_hours,
    durationMinutes: service.duration_minutes,
    stepMinutes: business.slot_step_minutes,
    bufferBeforeMinutes: service.buffer_before ?? 0,
    bufferAfterMinutes: service.buffer_after ?? 0,
    busy: day.busy,
    holidays: day.holidays,
    nowMs,
    minHoursBefore: business.min_hours_before,
    maxDaysAhead: business.max_days_ahead,
    timeZone: businessTimeZone(business),
  });
}

// Свободные слоты услуги на дату.
export async function freeSlotsFor(
  business: BusinessSchedule,
  service: ServiceTiming,
  date: string,
  options: DayOptions | string = {},
): Promise<number[]> {
  // Строковый 4-й аргумент — старая сигнатура (excludeBookingId), оставлена для совместимости.
  const opts: DayOptions = typeof options === 'string' ? { excludeBookingId: options } : options;
  const day = await loadDayContext(business, date, opts.excludeBookingId);
  return slotsForDay(business, service, date, day, opts.nowMs);
}
