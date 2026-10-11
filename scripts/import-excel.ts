// scripts/import-excel.ts — импорт выгрузки 2GIS из командной строки (ТЗ §5.7). Логика в lib/import2gis.ts.
// Запуск: npx tsx scripts/import-excel.ts path/to/file.xlsx [--filter=шин] [--dry-run]
import { readFileSync, existsSync } from 'fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { importRows } from '../lib/import2gis';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const filter = args.find((a) => a.startsWith('--filter='))?.split('=')[1] ?? 'шин';
const dryRun = args.includes('--dry-run');
if (!file) {
  console.error('Укажите файл .xlsx');
  process.exit(1);
}

async function main() {
  const wb = XLSX.read(readFileSync(file!), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const stats = await importRows(db, rows, { filter, dryRun });
  console.log(dryRun ? `--dry-run: строк ${stats.total}, после фильтра «${filter}» ${stats.selected}, с email ${stats.withEmail}` : 'Готово:', dryRun ? '' : stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
