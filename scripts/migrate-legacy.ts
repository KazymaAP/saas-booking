// scripts/migrate-legacy.ts — миграция legacy-клиентов из CSV. Разбор — lib/legacy-csv.ts, запись — lib/legacy-apply.ts.
// Колонки: slug,name,city,phone,email,subscription_until,old_domain,new_url[,vertical]. Разделитель «,» или «;», кавычки по RFC 4180.
// Upsert по slug (повторный запуск идемпотентен), old_domain → legacy_redirects (upsert по from_domain).
// Запуск: npx tsx scripts/migrate-legacy.ts path/to/legacy.csv [--dry-run] [--json]
// Коды выхода: 0 — успех, 1 — сбой, 2 — неверные аргументы/файл, 3 — часть строк пропущена или пачка не записана.
import { applyLegacy, supabaseLegacyStore, type LegacyStats } from '../lib/legacy-apply';
import { CsvError, MAX_CSV_BYTES, parseLegacyCsv, type ParsedLegacy } from '../lib/legacy-csv';
import { CliError, err, loadEnvFile, out, parseArgs, readInputFile, runCli, serviceClient } from './cli';

const USAGE = 'Использование: npx tsx scripts/migrate-legacy.ts <legacy.csv> [--dry-run] [--json]';
const KNOWN_FLAGS: ReadonlySet<string> = new Set(['dry-run', 'json', 'help']);

function parse(data: Buffer): ParsedLegacy {
  try {
    return parseLegacyCsv(data.toString('utf8'));
  } catch (e) {
    if (e instanceof CsvError) throw new CliError(e.message);
    throw e;
  }
}

function report(parsed: ParsedLegacy, stats: LegacyStats | null): string[] {
  const lines = [
    stats ? 'Миграция завершена' : 'Проверка (--dry-run), в БД ничего не записано',
    `  валидных записей:  ${parsed.records.length}`,
    `  повторов slug:     ${parsed.duplicates}`,
    `  пропущено строк:   ${parsed.errors.length}`,
    `  с редиректом:      ${parsed.records.filter((r) => r.redirect).length}`,
  ];
  if (stats) lines.push(`  создано:           ${stats.created}`, `  обновлено:         ${stats.updated}`, `  редиректов:        ${stats.redirects}`);
  const errors = [...parsed.errors, ...(stats?.errors ?? [])];
  if (errors.length > 0) lines.push('Ошибки:', ...errors.map((e) => `  - ${e}`));
  return lines;
}

async function main(): Promise<number> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.has('help')) {
    out(USAGE);
    return 0;
  }
  const unknown = [...flags.keys()].filter((k) => !KNOWN_FLAGS.has(k));
  if (unknown.length > 0) throw new CliError(`Неизвестные параметры: ${unknown.map((k) => `--${k}`).join(', ')}\n${USAGE}`);
  const parsed = parse(readInputFile(positional[0], MAX_CSV_BYTES, /\.csv$/i));
  let stats: LegacyStats | null = null;
  if (!flags.has('dry-run')) {
    loadEnvFile();
    stats = await applyLegacy(supabaseLegacyStore(serviceClient()), parsed.records, new Date().toISOString().slice(0, 10));
  }
  if (flags.has('json')) out(JSON.stringify({ parsed: { records: parsed.records.length, duplicates: parsed.duplicates, errors: parsed.errors }, stats }, null, 2));
  else report(parsed, stats).forEach(out);
  const failed = parsed.errors.length + (stats?.errors.length ?? 0);
  if (failed > 0) err(`Внимание: ${failed} ошибок`);
  return failed > 0 ? 3 : 0;
}

runCli(main);
