// lib/booking-dates.ts — даты для выбора в форме записи (чистые функции, браузер и сервер).
// Все даты — календарь бизнеса (IANA-пояс), а не браузера: клиент в Новосибирске записывается
// в московскую студию по московскому календарю.
import { DEFAULT_TIME_ZONE, addDays, localDateOf, parseDate } from './slots';
import type { WorkingHours } from './database.types';
import { normalizeIntervals } from './hours';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
// Сколько дней показывать «чипами» (остальные — через календарь). Две недели помещаются в одну прокрутку.
export const DATE_STRIP_DAYS = 14;
const HOUR_MS = 3_600_000;

// Настройки расписания, которые нужны форме. Все поля необязательны — есть дефолты ТЗ §4.6.
export type ClientSchedule = {
  timeZone?: string;
  minHoursBefore?: number;
  maxDaysAhead?: number;
  workingHours?: WorkingHours | null;
};

export const SCHEDULE_DEFAULTS = { timeZone: DEFAULT_TIME_ZONE, minHoursBefore: 2, maxDaysAhead: 30 } as const;

export type ResolvedSchedule = { timeZone: string; minHoursBefore: number; maxDaysAhead: number; workingHours: WorkingHours | null };

export function resolveSchedule(schedule: ClientSchedule | undefined): ResolvedSchedule {
  return {
    timeZone: schedule?.timeZone ?? SCHEDULE_DEFAULTS.timeZone,
    minHoursBefore: Math.max(0, schedule?.minHoursBefore ?? SCHEDULE_DEFAULTS.minHoursBefore),
    maxDaysAhead: Math.max(0, schedule?.maxDaysAhead ?? SCHEDULE_DEFAULTS.maxDaysAhead),
    workingHours: schedule?.workingHours ?? null,
  };
}

// Границы выбора даты (min/max для <input type="date">). min учитывает min_hours_before:
// если до конца сегодняшнего дня записаться уже нельзя, минимальная дата — дата «сейчас + min_hours_before».
export function dateBounds(schedule: ResolvedSchedule, nowMs: number): { min: string; max: string } {
  const today = localDateOf(nowMs, schedule.timeZone);
  const earliest = localDateOf(nowMs + schedule.minHoursBefore * HOUR_MS, schedule.timeZone);
  return { min: earliest, max: addDays(today, schedule.maxDaysAhead) };
}

export function isDateInBounds(date: string, bounds: { min: string; max: string }): boolean {
  return parseDate(date) !== null && date >= bounds.min && date <= bounds.max;
}

function weekdayOf(date: string): (typeof WEEKDAY_KEYS)[number] | null {
  const ms = parseDate(date);
  return ms === null ? null : WEEKDAY_KEYS[new Date(ms).getUTCDay()];
}

// Выходной по графику (нет интервалов на этот день недели). Без графика — неизвестно, считаем рабочим.
export function isClosedDay(date: string, workingHours: WorkingHours | null): boolean {
  if (workingHours === null) return false;
  const key = weekdayOf(date);
  if (key === null) return true;
  // Нестандартная форма значения дня (объект вместо массива) не должна превращать все дни в выходные.
  return normalizeIntervals(workingHours[key]).length === 0;
}

export type DateOption = { date: string; weekday: string; day: string; month: string; closed: boolean; label: string };

const weekdayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' });
const fullFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// Подпись даты для экранного диктора: «вторник, 20 октября».
export function dateLabel(date: string): string {
  const ms = parseDate(date);
  return ms === null ? date : fullFormat.format(ms);
}

// Ближайшие даты для чипов: от min до min(max, min + DATE_STRIP_DAYS − 1).
export function dateOptions(schedule: ResolvedSchedule, nowMs: number, days: number = DATE_STRIP_DAYS): DateOption[] {
  const bounds = dateBounds(schedule, nowMs);
  const result: DateOption[] = [];
  for (let date = bounds.min; date <= bounds.max && result.length < days; date = addDays(date, 1)) {
    const ms = parseDate(date);
    if (ms === null) break;
    const closed = isClosedDay(date, schedule.workingHours);
    result.push({
      date,
      weekday: weekdayFormat.format(ms),
      day: dayFormat.format(ms),
      month: monthFormat.format(ms),
      closed,
      label: closed ? `${dateLabel(date)}, выходной` : dateLabel(date),
    });
  }
  return result;
}

// Первая рабочая дата из списка — выбирается по умолчанию, чтобы слоты появились сразу.
export function firstOpenDate(options: readonly DateOption[]): string {
  return options.find((option) => option.closed === false)?.date ?? '';
}
