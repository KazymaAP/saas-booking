// scripts/import-excel.ts — импорт выгрузки 2GIS из командной строки (ТЗ §11.1, §13.2 шаг 1). Логика — lib/import2gis.ts.
// Запуск: npx tsx scripts/import-excel.ts path/to/file.xlsx [--filter=шин] [--dry-run] [--json]
// Коды выхода: 0 — успех, 1 — сбой, 2 — неверные аргументы или файл, 3 — импорт прошёл, но были ошибки строк/пачек.
import { DEFAULT_FILTER, ImportError, MAX_FILE_BYTES, importRows, parseWorkbook, type ImportStats, type Row } from '../../общие/lib/import2gis';
import { OFFLINE_STORE } from '../../общие/lib/import2gis-store';
import { CliError, err, loadEnvFile, out, parseArgs, readInputFile, runCli, serviceClient } from './cli';

const USAGE = 'Использование: npx tsx scripts/import-excel.ts <файл.xlsx> [--filter=шин] [--dry-run] [--json]';
const MAX_FILTER_LENGTH = 100;
const KNOWN_FLAGS: ReadonlySet<string> = new Set(['filter', 'dry-run', 'json', 'help']);

function report(stats: ImportStats, filter: string): string[] {
  const lines = [
    stats.dryRun ? 'Проверка (--dry-run), в БД ничего не записано' : 'Импорт завершён',
    `  строк в файле:        ${stats.total}`,
    `  по фильтру:           ${stats.selected} («${filter}»)`,
    `  с email:              ${stats.withEmail}`,
    `  невалидных:           ${stats.invalid}`,
    `  дублей в файле:       ${stats.duplicates}`,
  ];
  if (!stats.dryRun) {
    lines.push(`  создано:              ${stats.created}`, `  обновлено:            ${stats.updated}`, `  без изменений:        ${stats.unchanged}`);
  }
  lines.push(`  время:                ${(stats.durationMs / 1000).toFixed(1)} с`);
  if (stats.errors.length > 0) lines.push('Ошибки:', ...stats.errors.map((e) => `  - ${e}`));
  return lines;
}

function readRows(data: Buffer): Row[] {
  try {
    return parseWorkbook(new Uint8Array(data));
  } catch (e) {
    if (e instanceof ImportError) throw new CliError(e.message);
    throw e;
  }
}

async function main(): Promise<number> {
  const { positional, flags } = parseArgs(process.argv.slice(2), ['filter']);
  if (flags.has('help')) {
    out(USAGE);
    return 0;
  }
  const unknown = [...flags.keys()].filter((k) => !KNOWN_FLAGS.has(k));
  if (unknown.length > 0) throw new CliError(`Неизвестные параметры: ${unknown.map((k) => `--${k}`).join(', ')}\n${USAGE}`);
  const rawFilter = flags.get('filter');
  const filter = typeof rawFilter === 'string' ? rawFilter.trim() : DEFAULT_FILTER;
  if (!filter || filter.length > MAX_FILTER_LENGTH) throw new CliError(`--filter: от 1 до ${MAX_FILTER_LENGTH} символов`);
  const dryRun = flags.has('dry-run');

  const data = readInputFile(positional[0], MAX_FILE_BYTES, /\.xlsx$/i);
  const rows = readRows(data);
  loadEnvFile();
  // В dry-run БД не нужна — можно проверить файл без ключей Supabase.
  const stats = await importRows(dryRun ? OFFLINE_STORE : serviceClient(), rows, { filter, dryRun });
  if (flags.has('json')) out(JSON.stringify(stats, null, 2));
  else report(stats, filter).forEach(out);
  if (stats.errors.length > 0 && !dryRun) {
    err(`Внимание: ${stats.errors.length} ошибок, см. список выше`);
    return 3;
  }
  return 0;
}

runCli(main);
