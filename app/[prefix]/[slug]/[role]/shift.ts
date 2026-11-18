// app/[prefix]/[slug]/[role]/shift.ts — модель «смены»: записи одного дня и счётчики для шапки.
// Чистый модуль: используется серверной страницей (данные) и клиентским списком (пересчёт после смены статуса).
import type { BookingStatus } from '@/lib/database.types';
import { formatTime } from '../admin/(protected)/_lib/time';

export const SHIFT_SELECT = 'id, scheduled_at, status, client_name, client_phone, comment, services(name)';

export type ShiftDbRow = {
  id: string;
  scheduled_at: string;
  status: BookingStatus;
  client_name: string | null;
  client_phone: string | null;
  comment: string | null;
  services: { name: string } | null;
};

export type ShiftRow = {
  id: string;
  time: string; // «14:30» в часовом поясе бизнеса — форматируется на сервере
  starts_at: number; // мс UTC: от него зависит, доступны ли «Выполнено» / «Не пришёл»
  status: BookingStatus;
  client_name: string | null;
  client_phone: string | null;
  comment: string | null;
  service: string;
};

export function toShiftRow(b: ShiftDbRow): ShiftRow {
  return {
    id: b.id,
    time: formatTime(b.scheduled_at),
    starts_at: new Date(b.scheduled_at).getTime(),
    status: b.status,
    client_name: b.client_name,
    client_phone: b.client_phone,
    comment: b.comment,
    service: b.services?.name ?? 'Услуга удалена',
  };
}

export type ShiftStats = {
  total: number; // всего записей на день
  awaiting: number; // ждут подтверждения — то, ради чего сотрудник открывает страницу
  left: number; // ещё не начались
  done: number; // закрыты (выполнено или не пришёл)
};

// Счётчики считаются по тем же строкам, что видит сотрудник: после смены статуса они пересчитываются на клиенте.
export function shiftStats(rows: readonly ShiftRow[], now: number): ShiftStats {
  let awaiting = 0;
  let left = 0;
  let done = 0;
  for (const row of rows) {
    if (row.status === 'new') awaiting += 1;
    if (row.starts_at > now && (row.status === 'new' || row.status === 'confirmed')) left += 1;
    if (row.status === 'done' || row.status === 'no_show') done += 1;
  }
  return { total: rows.length, awaiting, left, done };
}

// Записи, которые ещё требуют работы: новые и подтверждённые. Остальные — история дня, свёрнутая внизу.
export function isOpenShiftRow(row: ShiftRow): boolean {
  return row.status === 'new' || row.status === 'confirmed';
}
