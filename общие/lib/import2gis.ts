// lib/import2gis.ts — импорт выгрузки 2GIS (ТЗ §11, §13.2 шаг 1). Используют scripts/import-excel.ts и /api/import/2gis.
// Конвейер: xlsx → строки → Zod-кандидаты (нормализация телефонов, email, сайтов) → дедупликация внутри файла
// → сопоставление с БД (сначала source_2gis_url, потом phones[0] + адрес) → вставка/обновление пачками по 100.
// Повторный импорт идемпотентен: существующие записи получают только безопасные поля, name и slug не трогаются.
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyCandidates, pushError } from './import2gis-apply';
import { type Candidate, type Row, dedupeCandidates, detectColumns, parseRow } from './import2gis-parse';
import { type ImportStore, supabaseImportStore } from './import2gis-store';

export { BATCH_SIZE } from './import2gis-apply';
export {
  ImportError, MAX_FILE_BYTES, MAX_ROWS, normalize2gisUrl, normalizeAddress, normalizeEmail, normalizeWebsite,
  parseWorkbook, verticalFor, type Row,
} from './import2gis-parse';

export const DEFAULT_FILTER = 'шин';

export type ImportStats = {
  total: number; selected: number; withEmail: number; created: number; updated: number; unchanged: number;
  skipped: number; invalid: number; duplicates: number; dryRun: boolean; durationMs: number; errors: string[];
};

export type ImportOptions = { filter?: string; dryRun?: boolean; now?: () => number };

const cellLower = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).toLowerCase();

function selectCandidates(rows: readonly Row[], filter: string, stats: ImportStats): Candidate[] {
  const cols = detectColumns(rows);
  const out: Candidate[] = [];
  rows.forEach((row, i) => {
    if (!cellLower(row['Рубрики']).includes(filter)) return;
    stats.selected++;
    const res = parseRow(row, cols);
    if (res.ok) {
      out.push(res.value);
      return;
    }
    stats.invalid++;
    // +2: строка 1 — заголовки, нумерация Excel с единицы.
    pushError(stats, `Строка ${i + 2}: ${res.error}`);
  });
  return out;
}

const isStore = (db: SupabaseClient | ImportStore): db is ImportStore => 'insertBatch' in db;

// db — клиент Supabase с service_role или своё хранилище (тесты). Фильтр по рубрике — подстрока без учёта регистра.
// dryRun — полный разбор и валидация без обращения к БД.
export async function importRows(db: SupabaseClient | ImportStore, rows: readonly Row[], opts: ImportOptions = {}): Promise<ImportStats> {
  const now = opts.now ?? Date.now;
  const started = now();
  const stats: ImportStats = {
    total: rows.length, selected: 0, withEmail: 0, created: 0, updated: 0, unchanged: 0,
    skipped: 0, invalid: 0, duplicates: 0, dryRun: Boolean(opts.dryRun), durationMs: 0, errors: [],
  };
  const filter = (opts.filter ?? DEFAULT_FILTER).trim().toLowerCase();
  const { unique, duplicates } = dedupeCandidates(selectCandidates(rows, filter, stats));
  stats.duplicates = duplicates;
  stats.skipped = stats.invalid + duplicates;
  stats.withEmail = unique.filter((c) => c.emails.length > 0).length;
  if (!opts.dryRun && unique.length > 0) {
    await applyCandidates(isStore(db) ? db : supabaseImportStore(db), unique, stats);
  }
  stats.durationMs = now() - started;
  return stats;
}
