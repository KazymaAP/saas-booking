// lib/backup-shared.ts — константы и типы бэкапа без серверных зависимостей.
// Импортируется и сервером (lib/backup.ts), и клиентскими компонентами панели (RestoreForm).
// Порядок важен: внешние ключи (0001_init.sql). services → bookings (service_id), outreach_log → emails_outgoing.
export const BACKUP_TABLES = [
  'vertical_templates',
  'businesses',
  'services',
  'photos',
  'admin_users',
  'bookings',
  'outreach_log',
  'emails_outgoing',
  'licenses',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

// Какие таблицы обязаны восстановиться, чтобы писать эту (иначе нарушение FK).
export const PARENTS: Record<BackupTable, readonly BackupTable[]> = {
  vertical_templates: [],
  businesses: ['vertical_templates'],
  services: ['businesses'],
  photos: ['businesses'],
  admin_users: ['businesses'],
  bookings: ['businesses', 'services'],
  outreach_log: ['businesses'],
  emails_outgoing: ['businesses', 'outreach_log'],
  licenses: ['businesses'],
};

export const BACKUP_BUCKET = 'backups';
export const BACKUP_FORMAT = 'saas-booking-backup';
export const BACKUP_VERSION = 1;
export const PAGE_SIZE = 1_000; // максимум строк PostgREST за один запрос
export const RESTORE_BATCH = 500; // требование «Batch 500 при restore»
export const SIGNED_URL_TTL_S = 300; // ссылка на скачивание живёт 5 минут
export const BACKUP_RETENTION_DAYS = 30; // ТЗ §16.7: retention 30 дней
export const MAX_ROWS_PER_TABLE = 500_000; // предохранитель от бесконечного цикла пагинации
export const BACKUP_FILE_RE = /^backup-\d{4}-\d{2}-\d{2}\.json$/;
export const RESTORE_CONFIRM_WORD = 'ВОССТАНОВИТЬ';

// Строка таблицы: произвольные колонки, обязателен id. unknown — потому что схема у таблиц разная.
export type Row = Record<string, unknown> & { id: string };
export type BackupDump = {
  format: typeof BACKUP_FORMAT;
  version: number;
  created_at: string;
  counts: Record<BackupTable, number>;
  // SHA-256 (hex) от JSON.stringify(tables). Нет в копиях старого формата — тогда проверяются только counts.
  checksum?: string;
  tables: Record<BackupTable, Row[]>;
};
export type TableReport = { rows: number; status: 'ok' | 'empty' | 'error' | 'skipped'; error?: string };
export type RestoreReport = { ok: boolean; tables: Record<BackupTable, TableReport>; total_rows: number };
export type BackupFile = { name: string; size: number | null; created_at: string | null };

// Объект «по таблице» без приведения типов: литерал со всеми 9 ключами проверяется компилятором.
export function perTable<T>(fn: (t: BackupTable) => T): Record<BackupTable, T> {
  return {
    vertical_templates: fn('vertical_templates'),
    businesses: fn('businesses'),
    services: fn('services'),
    photos: fn('photos'),
    admin_users: fn('admin_users'),
    bookings: fn('bookings'),
    outreach_log: fn('outreach_log'),
    emails_outgoing: fn('emails_outgoing'),
    licenses: fn('licenses'),
  };
}

const FILE_DATE_START = 'backup-'.length;
const FILE_DATE_LEN = 'YYYY-MM-DD'.length;

// Дата копии из имени файла backup-YYYY-MM-DD.json (полночь UTC).
export function backupFileDate(name: string): Date {
  return new Date(`${name.slice(FILE_DATE_START, FILE_DATE_START + FILE_DATE_LEN)}T00:00:00Z`);
}
