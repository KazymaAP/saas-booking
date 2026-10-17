// bookings/rows.ts — строка брони для клиентского списка: общий SELECT и маппинг (список броней и дашборд).
// Даты форматируются на сервере в часовом поясе бизнеса — клиенту не нужен Intl с таймзоной.
import type { BookingStatus } from '@/lib/database.types';
import { formatDateTime } from '../_lib/time';
import type { BookingRow } from './BookingList';

export const BOOKING_ROW_SELECT = 'id, scheduled_at, status, client_name, client_phone, comment, services(name)';

export type BookingDbRow = {
  id: string;
  scheduled_at: string;
  status: BookingStatus;
  client_name: string | null;
  client_phone: string | null;
  comment: string | null;
  services: { name: string } | null;
};

export function toBookingRow(b: BookingDbRow): BookingRow {
  return {
    id: b.id,
    when: formatDateTime(b.scheduled_at),
    starts_at: new Date(b.scheduled_at).getTime(),
    status: b.status,
    client_name: b.client_name,
    client_phone: b.client_phone,
    comment: b.comment,
    service: b.services?.name ?? 'Услуга удалена',
  };
}
