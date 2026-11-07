// lib/hours.ts — рабочее время бизнеса (ТЗ §4.6 working_hours, §43: массив интервалов, null = выходной).
// Модуль без зависимостей от сервера: используется и в форме настроек (клиентская валидация),
// и в server action (повторная проверка). Одни и те же правила с обеих сторон.
import type { WorkingHours, WorkingInterval } from './database.types';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Понедельник',
  tue: 'Вторник',
  wed: 'Среда',
  thu: 'Четверг',
  fri: 'Пятница',
  sat: 'Суббота',
  sun: 'Воскресенье',
};

// Больше интервалов в день на практике не бывает; защищает от мусора во вводе.
export const MAX_INTERVALS_PER_DAY = 6;
// Длина строки ввода: 6 интервалов «09:00-13:00, » ≈ 80 символов, берём с запасом.
export const MAX_INPUT_LENGTH = 120;

const MINUTES_IN_DAY = 24 * 60;
// Слова, которые владельцы пишут вместо пустой строки.
const DAY_OFF_WORDS = new Set(['выходной', 'вых', 'закрыто', '-', '—']);
// ЧЧ:ММ или Ч:ММ, разделитель — дефис, en/em-тире или «до».
const INTERVAL_RE = /^(\d{1,2})[:.](\d{2})\s*(?:-|–|—|до)\s*(\d{1,2})[:.](\d{2})$/i;

export type IntervalsResult =
  | { ok: true; value: WorkingInterval[] | null }
  | { ok: false; error: string };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Переводит часы и минуты в минуты от полуночи. 24:00 допустимо только как конец дня.
function toMinutes(h: number, m: number, isClose: boolean): number | null {
  if (m > 59) return null;
  if (h === 24 && m === 0 && isClose) return MINUTES_IN_DAY;
  if (h > 23) return null;
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// Убирает внешние скобки: владельцы копируют «(09:00-18:00)» или «[10:00-20:00]» из старых сайтов.
function stripBrackets(s: string): string {
  return s.replace(/^[([{]\s*/, '').replace(/\s*[)\]}]$/, '');
}

type Span = { open: number; close: number };

function parsePart(part: string): Span | string {
  const m = stripBrackets(part.trim()).match(INTERVAL_RE);
  if (!m) return `«${part.trim()}» — нужен формат 09:00-18:00`;
  const open = toMinutes(Number(m[1]), Number(m[2]), false);
  const close = toMinutes(Number(m[3]), Number(m[4]), true);
  if (open === null || close === null) return `«${part.trim()}» — такого времени нет`;
  if (open >= close) return `«${part.trim()}» — начало должно быть раньше конца`;
  return { open, close };
}

// Подробная проверка одной строки. Возвращает нормализованные интервалы (отсортированы, ЧЧ:ММ)
// или текст ошибки на русском — его показываем прямо под полем.
export function validateIntervals(raw: string): IntervalsResult {
  const s = stripBrackets(raw.trim());
  if (!s || DAY_OFF_WORDS.has(s.toLowerCase())) return { ok: true, value: null };
  if (raw.length > MAX_INPUT_LENGTH) return { ok: false, error: 'Слишком длинная строка' };

  const parts = s.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > MAX_INTERVALS_PER_DAY) {
    return { ok: false, error: `Не больше ${MAX_INTERVALS_PER_DAY} интервалов в день` };
  }

  const spans: Span[] = [];
  for (const part of parts) {
    const span = parsePart(part);
    if (typeof span === 'string') return { ok: false, error: span };
    spans.push(span);
  }

  spans.sort((a, b) => a.open - b.open);
  for (let i = 1; i < spans.length; i += 1) {
    if (spans[i].open < spans[i - 1].close) return { ok: false, error: 'Интервалы пересекаются' };
  }
  return { ok: true, value: spans.map((x) => ({ open: fromMinutes(x.open), close: fromMinutes(x.close) })) };
}

// Формат ввода: "09:00-13:00, 14:00-21:00". Пустая строка = выходной (null).
// Сохранена исходная сигнатура: 'invalid' вместо текста ошибки.
export function parseIntervals(raw: string): WorkingInterval[] | null | 'invalid' {
  const r = validateIntervals(raw);
  return r.ok ? r.value : 'invalid';
}

export function formatIntervals(iv: WorkingInterval[] | null | undefined): string {
  // Терпимо к форме из базы: объект вместо массива раньше валил страницу настроек кабинета.
  return normalizeIntervals(iv).map((i) => `${i.open}-${i.close}`).join(', ');
}

export type WeekResult =
  | { ok: true; value: WorkingHours }
  | { ok: false; errors: Partial<Record<DayKey, string>> };

// Разбирает всю неделю сразу. read(day) отдаёт строку поля для дня (из FormData или состояния формы).
export function parseWorkingHours(read: (day: DayKey) => string): WeekResult {
  const value: WorkingHours = {};
  const errors: Partial<Record<DayKey, string>> = {};
  for (const day of DAY_KEYS) {
    const r = validateIntervals(read(day));
    if (r.ok) value[day] = r.value;
    else errors[day] = r.error;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

// true, если хотя бы один день рабочий — нужно для чек-листа онбординга (ТЗ §13.13).
/**
 * Терпимый разбор значения дня из working_hours. Канон — массив {open, close}, но в базе
 * встречаются и другие формы (импорт, старые демо-данные): один объект, ключи from/to,
 * строка «09:00-18:00». Без нормализации расчёт слотов падал на «intervals is not iterable»,
 * и запись на сайте бизнеса отдавала 500.
 *
 * Порядок open/close НЕ проверяем: интервал 22:00–02:00 (работа через полночь) — легальный,
 * его разбирает slots.ts. Проверяем только формат времени.
 */
const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = HHMM_RE.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 24 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${m[2]}`;
}

export function normalizeIntervals(value: unknown): WorkingInterval[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((v) => normalizeIntervals(v));
  if (typeof value === 'string') {
    const result: WorkingInterval[] = [];
    for (const part of value.split(/[,;]/)) {
      const m = /^\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*$/.exec(part);
      if (!m) continue;
      const open = normalizeTime(m[1]);
      const close = normalizeTime(m[2]);
      if (open && close) result.push({ open, close });
    }
    return result;
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const open = normalizeTime(row.open ?? row.from);
    const close = normalizeTime(row.close ?? row.to);
    if (open && close) return [{ open, close }];
  }
  return [];
}

export function hasWorkingDays(hours: WorkingHours | null | undefined): boolean {
  if (!hours) return false;
  return DAY_KEYS.some((d) => normalizeIntervals(hours[d]).length > 0);
}
