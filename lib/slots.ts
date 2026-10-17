// lib/slots.ts — расчёт свободных слотов (ТЗ §10.1). Чистые функции без БД, работают и в браузере, и на сервере.
// Правила (ТЗ §10.1 + решения из notes.md):
// - слоты считаются на лету, таблицы slots нет;
// - часовой пояс бизнеса — IANA (businesses.timezone, по умолчанию Europe/Moscow); DST учитывается через Intl;
// - услуга целиком помещается в один интервал working_hours и не пересекает close;
// - интервал с close <= open (или close = 24:00) — работа через полночь, конец переносится на следующие сутки;
// - пересечение с бронью проверяется с учётом буферов: занято [start − buffer_before, end + buffer_after] у обеих броней;
// - раньше now + min_hours_before — слота нет; дата позже «сегодня + max_days_ahead» (по календарю бизнеса) — слотов нет;
// - день из business_holidays — слотов нет.
import type { WorkingHours, WorkingInterval } from './database.types';

export const DEFAULT_TIME_ZONE = 'Europe/Moscow';
export const DEFAULT_OFFSET_MINUTES = 180; // Europe/Moscow, для обратной совместимости с offsetMinutes

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MINUTES_PER_DAY = 1440;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

// Занятый интервал: [start, end) в epoch ms. Буферы — минуты подготовки/уборки вокруг брони.
export type BusyInterval = { start: number; end: number; bufferBefore?: number; bufferAfter?: number };

export type SlotInput = {
  date: string; // YYYY-MM-DD — дата в часовом поясе бизнеса
  workingHours: WorkingHours | null;
  durationMinutes: number;
  stepMinutes: number; // businesses.slot_step_minutes
  busy: BusyInterval[];
  nowMs: number;
  minHoursBefore: number;
  maxDaysAhead: number;
  bufferBeforeMinutes?: number; // services.buffer_before
  bufferAfterMinutes?: number; // services.buffer_after
  holidays?: readonly string[]; // business_holidays.date (YYYY-MM-DD)
  timeZone?: string; // IANA, приоритетнее offsetMinutes
  offsetMinutes?: number; // фиксированное смещение (устаревший вариант)
};

// ---------- Часовые пояса ----------

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (fmt === undefined) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

// true, если строка — известный Intl часовой пояс.
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    // Intl бросает RangeError на неизвестный пояс — это и есть ответ «невалиден», обработка не нужна.
    return false;
  }
}

// Смещение пояса относительно UTC в минутах для момента utcMs (Москва → 180).
export function tzOffsetMinutes(timeZone: string, utcMs: number): number {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(utcMs))) parts[part.type] = Number(part.value);
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = parts;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const flooredMs = utcMs - (((utcMs % 1000) + 1000) % 1000);
  return Math.round((asUtc - flooredMs) / MINUTE_MS);
}

type Zone = { timeZone: string | null; offsetMinutes: number };

function zoneOf(input: Pick<SlotInput, 'timeZone' | 'offsetMinutes'>): Zone {
  if (input.timeZone && isValidTimeZone(input.timeZone)) return { timeZone: input.timeZone, offsetMinutes: 0 };
  if (input.offsetMinutes !== undefined) return { timeZone: null, offsetMinutes: input.offsetMinutes };
  return { timeZone: DEFAULT_TIME_ZONE, offsetMinutes: 0 };
}

function offsetAt(zone: Zone, utcMs: number): number {
  return zone.timeZone === null ? zone.offsetMinutes : tzOffsetMinutes(zone.timeZone, utcMs);
}

// Перевод «настенного» времени (дата + минуты от полуночи) в UTC ms.
// Две итерации покрывают переходы DST: сначала угадываем смещение, затем уточняем по найденному моменту.
function wallToUtc(zone: Zone, dayUtcMs: number, minutes: number): number {
  const naive = dayUtcMs + minutes * MINUTE_MS;
  const first = naive - offsetAt(zone, naive) * MINUTE_MS;
  const second = naive - offsetAt(zone, first) * MINUTE_MS;
  return second;
}

// YYYY-MM-DD → Date.UTC этой даты (полночь UTC), null для невалидной даты.
export function parseDate(date: string): number | null {
  const m = DATE_RE.exec(date);
  if (m === null) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return ms;
}

function formatDate(dayUtcMs: number): string {
  return new Date(dayUtcMs).toISOString().slice(0, 10);
}

// Календарная дата момента utcMs в поясе бизнеса (YYYY-MM-DD).
export function localDateOf(utcMs: number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const zone = zoneOf({ timeZone });
  return formatDate(utcMs + offsetAt(zone, utcMs) * MINUTE_MS);
}

// Прибавляет к дате YYYY-MM-DD n дней.
export function addDays(date: string, days: number): string {
  const ms = parseDate(date);
  return ms === null ? date : formatDate(ms + days * DAY_MS);
}

// UTC-границы календарного дня бизнеса [start, end) — для выборки броней из БД.
export function dayBoundsUtc(date: string, timeZone: string = DEFAULT_TIME_ZONE): { start: number; end: number } | null {
  const day = parseDate(date);
  if (day === null) return null;
  const zone = zoneOf({ timeZone });
  return { start: wallToUtc(zone, day, 0), end: wallToUtc(zone, day + DAY_MS, 0) };
}

// ---------- Рабочие часы ----------

function toMinutes(hhmm: string): number | null {
  const m = TIME_RE.exec(hhmm);
  if (m === null) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes <= MINUTES_PER_DAY ? minutes : null;
}

// Интервалы работы в минутах от полуночи дня. close <= open → работа через полночь.
function intervalMinutes(iv: WorkingInterval): { open: number; close: number } | null {
  const open = toMinutes(iv.open);
  const close = toMinutes(iv.close);
  if (open === null || close === null || open >= MINUTES_PER_DAY) return null;
  return { open, close: close <= open ? close + MINUTES_PER_DAY : close };
}

function weekdayKey(dayUtcMs: number): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[new Date(dayUtcMs).getUTCDay()];
}

// ---------- Пересечения ----------

type Blocked = { start: number; end: number };

// Занятые интервалы с буферами, отсортированные по началу (для раннего выхода в цикле).
function blockedIntervals(busy: BusyInterval[]): Blocked[] {
  return busy
    .map((b) => ({
      start: b.start - (b.bufferBefore ?? 0) * MINUTE_MS,
      end: b.end + (b.bufferAfter ?? 0) * MINUTE_MS,
    }))
    .sort((a, b) => a.start - b.start);
}

function overlapsAny(blocked: Blocked[], start: number, end: number): boolean {
  for (const b of blocked) {
    if (b.start >= end) return false; // отсортировано: дальше только позже
    if (start < b.end) return true;
  }
  return false;
}

// ---------- Основной расчёт ----------

// Возвращает epoch ms начала свободных слотов (по возрастанию, без дублей).
export function freeSlots(input: SlotInput): number[] {
  const day = parseDate(input.date);
  if (day === null) return [];
  if (input.durationMinutes <= 0 || input.stepMinutes <= 0) return [];
  if (input.holidays?.includes(input.date)) return [];

  const zone = zoneOf(input);
  const today = formatDate(input.nowMs + offsetAt(zone, input.nowMs) * MINUTE_MS);
  if (input.date > addDays(today, input.maxDaysAhead)) return [];

  const intervals = input.workingHours?.[weekdayKey(day)] ?? [];
  const earliest = input.nowMs + input.minHoursBefore * HOUR_MS;
  const durMs = input.durationMinutes * MINUTE_MS;
  const stepMs = input.stepMinutes * MINUTE_MS;
  const beforeMs = (input.bufferBeforeMinutes ?? 0) * MINUTE_MS;
  const afterMs = (input.bufferAfterMinutes ?? 0) * MINUTE_MS;
  const blocked = blockedIntervals(input.busy);
  const result = new Set<number>();

  for (const iv of intervals) {
    const mins = intervalMinutes(iv);
    if (mins === null) continue;
    const open = wallToUtc(zone, day, mins.open);
    const close = wallToUtc(zone, day, mins.close);
    for (let start = open; start + durMs <= close; start += stepMs) {
      if (start < earliest) continue;
      if (overlapsAny(blocked, start - beforeMs, start + durMs + afterMs)) continue;
      result.add(start);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

// Свободен ли конкретный момент startMs (для проверки на сервере перед INSERT).
export function isSlotFree(input: SlotInput, startMs: number): boolean {
  return freeSlots(input).includes(startMs);
}

// Время слота для подписи кнопки: «14:30» в поясе бизнеса.
export function formatSlotTime(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone });
}

// Дата и время для текстов: «15 октября, 14:30».
export function formatSlotDateTime(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone });
}
