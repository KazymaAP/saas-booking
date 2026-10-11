// lib/hours.ts — разбор рабочего времени из текста (ТЗ §43: массив интервалов, null = выходной).
import type { WorkingInterval } from './database.types';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Формат ввода: "09:00-13:00, 14:00-21:00". Пустая строка = выходной (null).
export function parseIntervals(raw: string): WorkingInterval[] | null | 'invalid' {
  const s = raw.trim();
  if (!s) return null;
  const out: WorkingInterval[] = [];
  for (const part of s.split(',')) {
    const m = part.trim().match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
    if (!m || !TIME.test(m[1]) || !TIME.test(m[2]) || m[1] >= m[2]) return 'invalid';
    out.push({ open: m[1], close: m[2] });
  }
  return out;
}

export function formatIntervals(iv: WorkingInterval[] | null | undefined): string {
  if (!iv || iv.length === 0) return '';
  return iv.map((i) => `${i.open}-${i.close}`).join(', ');
}
