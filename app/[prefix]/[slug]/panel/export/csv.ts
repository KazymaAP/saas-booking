// export/csv.ts — сборка CSV броней (ТЗ §32). Чистый модуль: без БД, покрыт тестами.
// Формат под Excel в русской локали: разделитель «;», BOM UTF-8, переводы строк CRLF.
import type { BookingStatus } from '@/lib/database.types';

export const CSV_SEPARATOR = ';';
const BOM = '\uFEFF';
const EOL = '\r\n';

export type ExportBooking = {
  scheduled_at: string;
  status: BookingStatus;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  comment: string | null;
  created_at: string;
  services: { name: string; price: number | null } | null;
};

export const CSV_HEADER = ['Дата', 'Время', 'Статус', 'Клиент', 'Телефон', 'Email', 'Услуга', 'Цена', 'Комментарий', 'Создано'] as const;

// Защита от CSV-инъекций (OWASP): значение, начинающееся с = + - @ TAB CR, Excel выполнит как формулу.
// Клиент сам вводит имя и комментарий в форме записи — доверять им нельзя. Префикс «'» превращает формулу в текст.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  // Числа (цена) не экранируем: «-» у числа невозможен, а Excel должен видеть число.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[";\r\n,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(CSV_SEPARATOR);
}

type Formatters = { date: (iso: string) => string; time: (iso: string) => string; status: (s: BookingStatus) => string };

export function bookingToRow(b: ExportBooking, f: Formatters): string {
  return csvRow([
    f.date(b.scheduled_at), f.time(b.scheduled_at), f.status(b.status),
    b.client_name, b.client_phone, b.client_email,
    b.services?.name ?? 'Услуга удалена', b.services?.price ?? null,
    b.comment, `${f.date(b.created_at)} ${f.time(b.created_at)}`,
  ]);
}

export function buildCsv(rows: readonly ExportBooking[], f: Formatters): string {
  return BOM + [csvRow(CSV_HEADER), ...rows.map((r) => bookingToRow(r, f))].join(EOL) + EOL;
}

// Имя файла — только латиница/цифры/дефис: slug уже такой, но заголовок Content-Disposition не должен ломаться.
export function exportFilename(slug: string, now: Date): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'business';
  return `bookings-${safe}-${now.toISOString().slice(0, 10)}.csv`;
}
