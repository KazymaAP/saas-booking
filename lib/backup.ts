// lib/backup.ts — JSON-бэкап ключевых таблиц в приватный bucket backups и восстановление (ТЗ 4.0 §16.7).
// pg_dump на Vercel недоступен, поэтому дополнительно к еженедельному pg_dump (.github/workflows/backup.yml)
// делается ежедневная JSON-выгрузка через Supabase JS.
//
// Гарантии:
//   ▸ Полнота: страницы по PAGE_SIZE строк с сортировкой по id (PostgREST отдаёт максимум 1000 строк за запрос,
//     прежний select().limit(100000) молча обрезал таблицы).
//   ▸ Порядок restore: родители → дети (BACKUP_TABLES). Если родитель не восстановился — дети пропускаются.
//   ▸ Идемпотентность: upsert on conflict id; повторный restore того же файла даёт тот же результат.
//   ▸ Атомарность: каждый batch (≤500 строк) — один SQL-оператор, атомарен. Общей транзакции через PostgREST нет —
//     см. notes.md «Решения» (RPC для транзакции — зона агента 1).
// Зависимости спрятаны за BackupDb — модуль тестируется без Supabase.
import { adminClient } from './supabase';
import {
  BACKUP_TABLES,
  PARENTS,
  BACKUP_BUCKET,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  PAGE_SIZE,
  RESTORE_BATCH,
  SIGNED_URL_TTL_S,
  BACKUP_RETENTION_DAYS,
  MAX_ROWS_PER_TABLE,
  BACKUP_FILE_RE,
  RESTORE_CONFIRM_WORD,
  backupFileDate,
  perTable,
  type BackupTable,
  type Row,
  type BackupDump,
  type TableReport,
  type RestoreReport,
  type BackupFile,
} from './backup-shared';

// Реэкспорт: серверный код и тесты импортируют всё из lib/backup.
export {
  BACKUP_TABLES,
  BACKUP_BUCKET,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  PAGE_SIZE,
  RESTORE_BATCH,
  SIGNED_URL_TTL_S,
  BACKUP_RETENTION_DAYS,
  MAX_ROWS_PER_TABLE,
  BACKUP_FILE_RE,
  RESTORE_CONFIRM_WORD,
  backupFileDate,
  perTable,
  type BackupTable,
  type Row,
  type BackupDump,
  type TableReport,
  type RestoreReport,
  type BackupFile,
};

export interface BackupDb {
  selectPage(table: BackupTable, from: number, to: number): Promise<{ rows: Row[]; error: string | null }>;
  upsert(table: BackupTable, rows: Row[]): Promise<{ error: string | null }>;
  upload(name: string, body: string): Promise<{ error: string | null }>;
  download(name: string): Promise<{ text: string | null; error: string | null }>;
  list(): Promise<{ files: BackupFile[]; error: string | null }>;
  remove(names: string[]): Promise<{ error: string | null }>;
  signedUrl(name: string, ttl_s: number): Promise<string | null>;
}

// ---------- Имена файлов ----------

export function backupFileName(now: Date = new Date()): string {
  return `backup-${now.toISOString().slice(0, 10)}.json`;
}

export function isBackupFileName(name: string): boolean {
  return BACKUP_FILE_RE.test(name);
}

function fileDate(name: string): number {
  return backupFileDate(name).getTime();
}

// ---------- Сбор ----------

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'неизвестная ошибка';
}

function isRow(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'id' in v && typeof v.id === 'string' && v.id.length > 0;
}

export async function collectTable(db: BackupDb, table: BackupTable): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE_SIZE) {
    const page = await db.selectPage(table, from, from + PAGE_SIZE - 1);
    if (page.error) throw new Error(`${table}: ${page.error}`);
    rows.push(...page.rows);
    if (page.rows.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${table}: больше ${MAX_ROWS_PER_TABLE} строк, нужна потоковая выгрузка`);
}

// Контрольная сумма содержимого: ловит ручную правку строк, которую не видят counts (число строк то же).
// Web Crypto — без зависимости от модуля crypto Node. Порядок ключей JSON сохраняется при parse → stringify.
export async function tablesChecksum(tables: Record<BackupTable, Row[]>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(tables)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const CHECKSUM_RE = /^[0-9a-f]{64}$/;

export async function collectBackup(db: BackupDb, now: Date = new Date()): Promise<BackupDump> {
  const collected = new Map<BackupTable, Row[]>();
  for (const t of BACKUP_TABLES) {
    collected.set(t, await collectTable(db, t)); // последовательно: не перегружаем пул соединений Supabase
  }
  const tables = perTable((t) => collected.get(t) ?? []);
  const counts = perTable((t) => tables[t].length);
  const checksum = await tablesChecksum(tables);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, created_at: now.toISOString(), counts, checksum, tables };
}

export type BackupRunResult = { ok: true; file: string; bytes: number; counts: Record<BackupTable, number>; removed: string[] } | { ok: false; error: string };

// Сбор + загрузка + удаление копий старше retention. Идемпотентно в пределах суток (тот же файл перезаписывается).
export async function runBackup(db: BackupDb, now: Date = new Date()): Promise<BackupRunResult> {
  let dump: BackupDump;
  try {
    dump = await collectBackup(db, now);
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
  const body = JSON.stringify(dump);
  const file = backupFileName(now);
  const up = await db.upload(file, body).catch((e: unknown) => ({ error: errorText(e) }));
  if (up.error) return { ok: false, error: `upload: ${up.error}` };
  // Сбой retention не делает бэкап неудачным: копия уже записана.
  const removed = await pruneBackups(db, now).catch((): string[] => []);
  return { ok: true, file, bytes: new TextEncoder().encode(body).length, counts: dump.counts, removed };
}

export async function pruneBackups(db: BackupDb, now: Date = new Date()): Promise<string[]> {
  const { files, error } = await db.list();
  if (error) return [];
  const cutoff = now.getTime() - BACKUP_RETENTION_DAYS * 86_400_000;
  const old = files.map((f) => f.name).filter((n) => isBackupFileName(n) && fileDate(n) < cutoff);
  // Предохранитель: никогда не удаляем последнюю копию, даже если она старая (бэкап мог долго падать).
  const keepNewest = files.map((f) => f.name).filter(isBackupFileName).sort().pop();
  const toRemove = old.filter((n) => n !== keepNewest);
  if (toRemove.length === 0) return [];
  const rm = await db.remove(toRemove);
  return rm.error ? [] : toRemove;
}

// ---------- Разбор и проверка дампа ----------

export type ParseResult = { ok: true; dump: BackupDump } | { ok: false; error: string };

// Одна таблица дампа: массив строк с непустым уникальным id. Возвращает строки или текст ошибки.
// Дубли id отклоняются: Postgres не даёт ON CONFLICT DO UPDATE обновить одну строку дважды в одном batch.
function parseTable(t: BackupTable, v: unknown): Row[] | string {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return `${t}: ожидался массив`;
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < v.length; i += 1) {
    const r: unknown = v[i];
    if (!isRow(r)) return `${t}: строка ${i + 1} без id`;
    if (seen.has(r.id)) return `${t}: повторяется id в строке ${i + 1}`;
    seen.add(r.id);
    rows.push(r);
  }
  return rows;
}

// Принимает новый формат {format, tables} и старый (таблицы на верхнем уровне, из cron/[job]).
export function parseDump(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'файл не является JSON' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'неверная структура' };
  const obj: Record<string, unknown> = { ...raw };
  const isNew = obj.format === BACKUP_FORMAT;
  if (isNew && Number(obj.version) > BACKUP_VERSION) return { ok: false, error: `версия ${String(obj.version)} новее поддерживаемой` };
  const src = isNew && typeof obj.tables === 'object' && obj.tables !== null ? { ...obj.tables } : obj;
  const srcRec: Record<string, unknown> = src;
  const parsed = new Map<BackupTable, Row[]>();
  for (const t of BACKUP_TABLES) {
    const r = parseTable(t, srcRec[t]);
    if (typeof r === 'string') return { ok: false, error: r };
    parsed.set(t, r);
  }
  const tables = perTable((t) => parsed.get(t) ?? []);
  const counts = perTable((t) => tables[t].length);
  // Счётчики из файла — контроль целостности: файл обрезан или отредактирован вручную → не восстанавливаем.
  if (isNew && typeof obj.counts === 'object' && obj.counts !== null) {
    const declared: Record<string, unknown> = { ...obj.counts };
    const bad = BACKUP_TABLES.find((t) => declared[t] !== undefined && declared[t] !== counts[t]);
    if (bad) return { ok: false, error: `${bad}: в файле ${String(declared[bad])} строк по счётчику, найдено ${counts[bad]}` };
  }
  const created_at = typeof obj.created_at === 'string' ? obj.created_at : '';
  if (isNew && obj.checksum !== undefined && (typeof obj.checksum !== 'string' || !CHECKSUM_RE.test(obj.checksum))) {
    return { ok: false, error: 'неверный формат контрольной суммы' };
  }
  const checksum = isNew && typeof obj.checksum === 'string' ? obj.checksum : undefined;
  return { ok: true, dump: { format: BACKUP_FORMAT, version: BACKUP_VERSION, created_at, counts, checksum, tables } };
}

// ---------- Восстановление ----------

// Текст ошибки Postgres уходит в отчёт, audit и Telegram. Детали вида «Key (email)=(a@b.ru)» содержат
// значения строк (PII) — оставляем имена колонок, значения заменяем.
export function scrubDbError(message: string): string {
  return message
    .replace(/\)=\([^)]*\)/g, ')=(…)')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '…@…')
    .replace(/\+?\d[\d\s()-]{8,}\d/g, '…')
    .slice(0, 300);
}

async function restoreTable(db: BackupDb, table: BackupTable, rows: Row[]): Promise<TableReport> {
  if (rows.length === 0) return { rows: 0, status: 'empty' };
  let written = 0;
  for (let i = 0; i < rows.length; i += RESTORE_BATCH) {
    const chunk = rows.slice(i, i + RESTORE_BATCH);
    // Исключение (обрыв сети) превращаем в ошибку таблицы, чтобы отчёт по остальным таблицам всё равно собрался.
    const { error } = await db.upsert(table, chunk).catch((e: unknown) => ({ error: errorText(e) }));
    if (error) return { rows: written, status: 'error', error: scrubDbError(error) };
    written += chunk.length;
  }
  return { rows: written, status: 'ok' };
}

export async function restoreDump(db: BackupDb, dump: BackupDump): Promise<RestoreReport> {
  const reports = new Map<BackupTable, TableReport>();
  const failed = new Set<BackupTable>();
  let total = 0;
  for (const t of BACKUP_TABLES) {
    const brokenParent = PARENTS[t].find((p) => failed.has(p));
    if (brokenParent) {
      reports.set(t, { rows: 0, status: 'skipped', error: `не восстановлена родительская таблица ${brokenParent}` });
      failed.add(t);
      continue;
    }
    const r = await restoreTable(db, t, dump.tables[t]);
    if (r.status === 'error') failed.add(t);
    reports.set(t, r);
    total += r.rows;
  }
  const tables = perTable((t): TableReport => reports.get(t) ?? { rows: 0, status: 'empty' });
  return { ok: failed.size === 0, tables, total_rows: total };
}

export function isRestoreConfirmed(word: unknown): boolean {
  return typeof word === 'string' && word.trim() === RESTORE_CONFIRM_WORD;
}

// Человекочитаемый отчёт для audit/Telegram/интерфейса.
export function formatReport(r: RestoreReport): string {
  return BACKUP_TABLES.map((t) => {
    const x = r.tables[t];
    const tail = x.status === 'ok' || x.status === 'empty' ? '' : ` (${x.status === 'skipped' ? 'пропущено' : 'ошибка'})`;
    return `${t}: ${x.rows}${tail}`;
  }).join(', ');
}

// ---------- Реализация на Supabase (service_role, только сервер) ----------

export function supabaseBackupDb(): BackupDb {
  const db = adminClient();
  const bucket = () => db.storage.from(BACKUP_BUCKET);
  return {
    async selectPage(table, from, to) {
      // Сортировка по id обязательна: без неё страницы PostgREST могут пересекаться или пропускать строки.
      const { data, error } = await db.from(table).select('*').order('id', { ascending: true }).range(from, to);
      if (error) return { rows: [], error: error.message };
      const rows: unknown[] = data ?? [];
      return { rows: rows.filter(isRow), error: null };
    },
    async upsert(table, rows) {
      const { error } = await db.from(table).upsert(rows, { onConflict: 'id' });
      return { error: error ? error.message : null };
    },
    async upload(name, body) {
      const { error } = await bucket().upload(name, body, { contentType: 'application/json', upsert: true });
      return { error: error ? error.message : null };
    },
    async download(name) {
      const { data, error } = await bucket().download(name);
      if (error || !data) return { text: null, error: error ? error.message : 'not_found' };
      return { text: await data.text(), error: null };
    },
    async list() {
      const { data, error } = await bucket().list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
      if (error) return { files: [], error: error.message };
      const files = (data ?? []).map((f) => ({
        name: f.name,
        size: typeof f.metadata?.size === 'number' ? f.metadata.size : null,
        created_at: f.created_at ?? null,
      }));
      return { files, error: null };
    },
    async remove(names) {
      const { error } = await bucket().remove(names);
      return { error: error ? error.message : null };
    },
    async signedUrl(name, ttl_s) {
      const { data } = await bucket().createSignedUrl(name, ttl_s);
      return data?.signedUrl ?? null;
    },
  };
}

// Список копий для панели: только файлы нашего формата, новые сверху, с подписанной ссылкой (TTL 300 с).
export type BackupListItem = BackupFile & { url: string | null };
export const BACKUP_LIST_LIMIT = 30;

export async function listBackups(db: BackupDb): Promise<{ items: BackupListItem[]; error: string | null }> {
  const { files, error } = await db.list();
  if (error) return { items: [], error };
  const own = files.filter((f) => isBackupFileName(f.name)).sort((a, b) => b.name.localeCompare(a.name)).slice(0, BACKUP_LIST_LIMIT);
  const items = await Promise.all(own.map(async (f) => ({ ...f, url: await db.signedUrl(f.name, SIGNED_URL_TTL_S) })));
  return { items, error: null };
}

// Полный цикл восстановления из файла bucket: проверка имени, скачивание, разбор, запись.
export type RestoreFileResult =
  | { ok: true; report: RestoreReport }
  | { ok: false; reason: 'file_name' | 'not_found' | 'parse'; error: string };

export async function restoreFromFile(db: BackupDb, name: string): Promise<RestoreFileResult> {
  if (!isBackupFileName(name)) return { ok: false, reason: 'file_name', error: 'неверное имя файла' };
  const file = await db.download(name).catch((e: unknown) => ({ text: null, error: errorText(e) }));
  if (file.text === null) return { ok: false, reason: 'not_found', error: file.error ?? 'not_found' };
  const parsed = parseDump(file.text);
  if (!parsed.ok) return { ok: false, reason: 'parse', error: parsed.error };
  // Проверка до первой записи: повреждённая копия не должна частично перезаписать рабочую базу.
  if (parsed.dump.checksum && (await tablesChecksum(parsed.dump.tables)) !== parsed.dump.checksum) {
    return { ok: false, reason: 'parse', error: 'контрольная сумма не совпадает — файл изменён или повреждён' };
  }
  return { ok: true, report: await restoreDump(db, parsed.dump) };
}

// ---------- Плановый запуск (cron и кнопка «Сделать копию сейчас») ----------

export type BackupJobDeps = {
  db: BackupDb;
  purge_pings: (now: Date) => Promise<number>; // retention license_pings (§4.50), см. lib/license-server.ts
  notify: (text: string) => Promise<unknown>; // Telegram владельцу сервиса
  log_error: (message: string, payload: Record<string, unknown>) => Promise<void>;
  audit: (action: string, payload: Record<string, unknown>) => Promise<void>;
};
export type BackupJobResult = BackupRunResult & { pings_purged: number | null; trigger: 'cron' | 'manual' };

// Бэкап + retention. Сбой бэкапа → журнал ошибок + Telegram (требование «Backup fail → лог + Telegram»).
// Сбой очистки license_pings не отменяет успешный бэкап — только пишется в журнал.
export async function performBackup(deps: BackupJobDeps, trigger: 'cron' | 'manual', now: Date = new Date()): Promise<BackupJobResult> {
  const result = await runBackup(deps.db, now);
  if (!result.ok) {
    await deps.log_error(`backup: ${result.error.slice(0, 300)}`, { trigger });
    await deps.notify(`🚨 Резервная копия не создана (${trigger}): ${result.error.slice(0, 200)}. Подробности: /panel/logs`);
    return { ...result, pings_purged: null, trigger };
  }
  let pings_purged: number | null = null;
  try {
    pings_purged = await deps.purge_pings(now);
  } catch (e) {
    await deps.log_error('backup: очистка license_pings не удалась', { error: e instanceof Error ? e.message.slice(0, 200) : 'unknown' });
  }
  await deps.audit('backup_created', { trigger, file: result.file, bytes: result.bytes, counts: result.counts, removed: result.removed, pings_purged });
  return { ...result, pings_purged, trigger };
}

// ---------- Restore по запросу супер-админа ----------

// Защита от двойного запуска (двойной клик, две вкладки): блокировка с TTL. TTL > maxDuration маршрута,
// чтобы упавший процесс не держал блокировку вечно.
export const RESTORE_LOCK_TTL_S = 600;
export interface RestoreLock {
  acquire(): Promise<boolean>;
  release(): Promise<void>;
}

export type RestoreRequestDeps = {
  db: BackupDb;
  lock: RestoreLock;
  log_error: (message: string, payload: Record<string, unknown>) => Promise<void>;
  audit: (action: string, payload: Record<string, unknown>) => Promise<void>;
  notify: (text: string) => Promise<unknown>;
};
export type RestoreRequestResult = { http_status: number; body: { ok: boolean; reason?: string; error?: string; report?: RestoreReport; summary?: string } };

// Проверка подтверждения → блокировка → восстановление → audit. Блокировка снимается всегда (finally).
export async function handleRestoreRequest(input: { file: unknown; confirm: unknown }, deps: RestoreRequestDeps): Promise<RestoreRequestResult> {
  if (!isRestoreConfirmed(input.confirm)) return { http_status: 400, body: { ok: false, reason: 'confirm' } };
  if (typeof input.file !== 'string' || !isBackupFileName(input.file)) return { http_status: 400, body: { ok: false, reason: 'file_name' } };
  const file = input.file;
  // Сбой хранилища блокировки → отказ (503), а не restore без защиты от параллельного запуска.
  const acquired = await deps.lock.acquire().catch((): null => null);
  if (acquired === null) return { http_status: 503, body: { ok: false, reason: 'lock' } };
  if (!acquired) return { http_status: 409, body: { ok: false, reason: 'in_progress' } };
  try {
    const r = await restoreFromFile(deps.db, file);
    if (!r.ok) return { http_status: r.reason === 'not_found' ? 404 : 400, body: { ok: false, reason: r.reason, error: r.error } };
    const summary = formatReport(r.report);
    await deps.audit('backup_restore', { file, ok: r.report.ok, total_rows: r.report.total_rows, summary });
    if (!r.report.ok) {
      await deps.log_error(`restore ${file}: ${summary}`.slice(0, 500), { file });
      await deps.notify(`⚠️ Восстановление из ${file} завершено с ошибками: ${summary}`.slice(0, 1000));
    }
    // 207: часть таблиц восстановлена, часть нет — интерфейс показывает отчёт по таблицам.
    return { http_status: r.report.ok ? 200 : 207, body: { ok: r.report.ok, report: r.report, summary } };
  } finally {
    await deps.lock.release();
  }
}
