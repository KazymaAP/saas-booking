// _lib/time.ts — время кабинета в часовом поясе бизнеса.
// В схеме нет businesses.timezone (см. notes.md), поэтому как в lib/slots.ts: Europe/Moscow, UTC+3 без перехода.
export const BUSINESS_TZ = 'Europe/Moscow';
const OFFSET_MS = 3 * 3_600_000;
export const DAY_MS = 86_400_000;

// Начало «сегодня» по Москве в UTC. На Vercel сервер в UTC: setHours(0) дал бы 03:00 МСК.
export function businessDayStart(nowMs: number): number {
  const local = nowMs + OFFSET_MS;
  return local - (local % DAY_MS) - OFFSET_MS;
}

const DAY_TITLE = new Intl.DateTimeFormat('ru-RU', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'long', weekday: 'long' });

// Номер дня по Москве (целое): одинаков для всех моментов одного календарного дня. Ключ группировки броней.
export function businessDayIndex(ms: number): number {
  return Math.floor((ms + OFFSET_MS) / DAY_MS);
}

// Заголовок группы: «Сегодня», «Завтра», «Вчера» или «среда, 21 октября».
export function dayTitle(ms: number, nowMs: number): string {
  const diff = businessDayIndex(ms) - businessDayIndex(nowMs);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  return DAY_TITLE.format(new Date(ms));
}

const DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: BUSINESS_TZ, day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit',
});
const DATE_ONLY = new Intl.DateTimeFormat('ru-RU', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'long', year: 'numeric' });

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return DATE_ONLY.format(new Date(iso));
}
