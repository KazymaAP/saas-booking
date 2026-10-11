// lib/slots.ts — расчёт свободных слотов (ТЗ §4.5, §41–44). Чистая функция, без БД.
// Решения по умолчанию (см. DECISIONS.md):
// - часовой пояс бизнеса фиксирован смещением (по умолчанию Москва, UTC+3, без перехода на летнее время с 2014);
// - запись должна полностью уложиться в часы работы (start + duration <= close);
// - занятость: интервалы [start, end) по бронированиям со статусом new/confirmed.
import type { WorkingHours, WorkingInterval } from './database.types';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const DEFAULT_OFFSET_MINUTES = 180; // Europe/Moscow

export type BusyInterval = { start: number; end: number }; // epoch ms

export type SlotInput = {
  date: string;                 // YYYY-MM-DD, дата в часовом поясе бизнеса
  workingHours: WorkingHours | null;
  durationMinutes: number;      // длительность услуги
  stepMinutes: number;          // шаг слота (§4.2 slot_step_minutes)
  busy: BusyInterval[];
  nowMs: number;
  minHoursBefore: number;       // §42
  maxDaysAhead: number;         // §42
  offsetMinutes?: number;
};

// Возвращает epoch ms начала свободных слотов.
export function freeSlots(input: SlotInput): number[] {
  const offset = input.offsetMinutes ?? DEFAULT_OFFSET_MINUTES;
  const [y, m, d] = input.date.split('-').map(Number);
  const localMidnightUtc = Date.UTC(y, m - 1, d) - offset * 60_000;

  const weekday = new Date(localMidnightUtc + offset * 60_000).getUTCDay();
  const intervals: WorkingInterval[] = input.workingHours?.[DAY_KEYS[weekday]] ?? [];

  const earliest = input.nowMs + input.minHoursBefore * 3_600_000;
  const latest = input.nowMs + input.maxDaysAhead * 86_400_000;
  const durMs = input.durationMinutes * 60_000;
  const stepMs = input.stepMinutes * 60_000;
  const result: number[] = [];

  for (const iv of intervals) {
    const open = localMidnightUtc + toMinutes(iv.open) * 60_000;
    const close = localMidnightUtc + toMinutes(iv.close) * 60_000;
    for (let start = open; start + durMs <= close; start += stepMs) {
      if (start < earliest || start > latest) continue;
      const end = start + durMs;
      if (input.busy.some((b) => start < b.end && end > b.start)) continue;
      result.push(start);
    }
  }
  return result;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
