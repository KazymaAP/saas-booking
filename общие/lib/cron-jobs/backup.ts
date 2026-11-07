// lib/cron-jobs/backup.ts — еженедельная JSON-выгрузка ключевых таблиц в приватный bucket backups (ТЗ §8.4, §16.7).
// Vercel Cron, воскресенье 03:00 UTC. Полный pg_dump делает GitHub Actions (.github/workflows/backup.yml).
// Таблицы читаются постранично (PostgREST режет ответ до max-rows, по умолчанию 1000 — раньше бэкап был молча неполным).
// Ошибка чтения любой таблицы → исключение → 500 + logError: неполный бэкап не записывается.
// Идемпотентно: файл backup-YYYY-MM-DD.json перезаписывается (upsert). Файлы старше 30 дней удаляются (§16.7).
import type { CronContext, CronResult } from '../cron';
import { DAY_MS, hasTimeLeft, unwrapRows } from './shared';

export const JOB = 'backup';
export const BACKUP_BUCKET = 'backups';
export const BACKUP_KEEP_DAYS = 30;
// Те же таблицы, что восстанавливает app/api/backup/restore/route.ts (порядок — родители раньше детей).
export const BACKUP_TABLES = [
  'vertical_templates', 'businesses', 'services', 'photos', 'admin_users', 'bookings', 'outreach_log', 'emails_outgoing', 'licenses',
] as const;
export const PAGE_SIZE = 1000;
// Предел страниц на таблицу: 200 × 1000 = 200 тыс. строк. Больше — бэкап не уложится в функцию Vercel, нужен pg_dump.
const MAX_PAGES = 200;
const BACKUP_FILE_RE = /^backup-(\d{4}-\d{2}-\d{2})\.json$/;
const LIST_LIMIT = 1000;

export type BackupRow = Record<string, unknown>;

async function readTable(ctx: CronContext, table: string): Promise<BackupRow[]> {
  const rows: BackupRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    if (hasTimeLeft(ctx) === false) throw new Error(`${JOB}: не уложился в бюджет времени на таблице ${table}`);
    const from = page * PAGE_SIZE;
    // Сортировка по id обязательна: без неё страницы могут пересекаться.
    const part = unwrapRows<BackupRow>(await ctx.db.from(table).select('*').order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1), `${JOB}: ${table}`);
    rows.push(...part);
    if (part.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${JOB}: в таблице ${table} больше ${MAX_PAGES * PAGE_SIZE} строк — нужен pg_dump`);
}

export function expiredBackups(names: readonly string[], now: Date): string[] {
  const cutoff = new Date(now.getTime() - BACKUP_KEEP_DAYS * DAY_MS).toISOString().slice(0, 10);
  return names.filter((name) => {
    const date = BACKUP_FILE_RE.exec(name)?.[1];
    return date !== undefined && date < cutoff;
  });
}

async function removeExpired(ctx: CronContext): Promise<number> {
  const storage = ctx.db.storage.from(BACKUP_BUCKET);
  const { data, error } = await storage.list('', { limit: LIST_LIMIT });
  if (error !== null) throw new Error(`${JOB}: список файлов: ${error.message}`);
  const expired = expiredBackups((data ?? []).map((file) => file.name), ctx.now);
  if (expired.length === 0) return 0;
  const removed = await storage.remove(expired);
  if (removed.error !== null) throw new Error(`${JOB}: удаление старых: ${removed.error.message}`);
  return expired.length;
}

export async function backup(ctx: CronContext): Promise<CronResult> {
  const dump: Record<string, BackupRow[]> = {};
  const counts: CronResult = {};
  // Последовательно: таблицы большие, параллельное чтение упрётся в лимит соединений PostgREST.
  for (const table of BACKUP_TABLES) {
    dump[table] = await readTable(ctx, table);
    counts[`rows_${table}`] = dump[table]?.length ?? 0;
  }
  const body = new TextEncoder().encode(JSON.stringify(dump));
  const file = `backup-${ctx.now.toISOString().slice(0, 10)}.json`;
  const { error } = await ctx.db.storage.from(BACKUP_BUCKET).upload(file, body, { contentType: 'application/json', upsert: true });
  if (error !== null) throw new Error(`${JOB}: загрузка: ${error.message}`);
  const removed = await removeExpired(ctx);
  return { file, bytes: body.length, removed, ...counts };
}
