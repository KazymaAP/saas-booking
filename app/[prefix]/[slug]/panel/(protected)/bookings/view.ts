// bookings/view.ts — представление списка броней: поиск и группировка по дням (часовой пояс бизнеса).
// Чистый модуль без React: используется клиентским BookingList, покрыт тестами.
import { businessDayIndex, dayTitle } from '../_lib/time';
import type { BookingRow } from './BookingList';

export type DayGroup = { key: number; title: string; rows: BookingRow[] };

// Группы идут в порядке строк (сервер уже отсортировал: предстоящие — по возрастанию, «все» — новые сверху).
export function groupByDay(rows: readonly BookingRow[], nowMs: number): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of rows) {
    const key = businessDayIndex(row.starts_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, title: dayTitle(row.starts_at, nowMs), rows: [row] });
  }
  return groups;
}

const digitsOnly = (s: string) => s.replace(/\D/g, '');

// Поиск по имени клиента, телефону (по цифрам: «999 123» найдёт «+7 (999) 123-45-67») и услуге.
// Короткий запрос по цифрам (< 3) не применяется к телефону — иначе «7» найдёт всех.
export function matchesQuery(row: BookingRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = `${row.client_name ?? ''} ${row.service} ${row.comment ?? ''}`.toLowerCase();
  if (text.includes(q)) return true;
  const qDigits = digitsOnly(q);
  return qDigits.length >= 3 && digitsOnly(row.client_phone ?? '').includes(qDigits);
}

// Поиск нужен, когда список длинный; на 1–5 строках поле только мешает.
export const SEARCH_MIN_ROWS = 6;
