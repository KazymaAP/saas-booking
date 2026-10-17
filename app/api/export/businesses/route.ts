// app/api/export/businesses/route.ts — экспорт бизнесов в CSV или XLSX (ТЗ §13.1). Только супер-админ.
// ▸ Фильтры — те же, что у списка /panel/businesses (status, city, vertical, q): общий разбор и применение.
// ▸ CSV стримится: строки читаются страницами по 1000 (лимит PostgREST) и сразу уходят клиенту —
//   память не растёт с размером выборки, браузер начинает скачивание сразу.
// ▸ XLSX не стримится (zip-контейнер собирается целиком, SheetJS) — выборка ограничена MAX_ROWS.
// ▸ Упёрлись в MAX_ROWS — truncated: true в audit, у XLSX ещё заголовок X-Export-Truncated.
// ▸ Выгрузка содержит контакты (ПД) — факт выгрузки пишется в audit (фильтры и число строк, без данных).
import * as XLSX from 'xlsx';
import { isSuperAdmin } from '@/lib/admin-session';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { errorMessage, logError } from '@/lib/log';
import { applyBusinessFilters, paramsFromUrl, readBusinessFilters, type BusinessFilters } from '@/app/panel/(protected)/_lib/business-filters';
import { BOM, COLUMNS, CSV_HEADER, csvLine, fileBase, xlsxRecord, type ExportRow } from './format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH = 1000;
const MAX_ROWS = 50_000;
const MAX_PAGES = MAX_ROWS / BATCH;

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Filters = Omit<BusinessFilters, 'page'>;

// Одна страница выборки. Сортировка по created_at + id — стабильный порядок между страницами.
async function fetchPage(f: Filters, page: number): Promise<ExportRow[]> {
  const from = page * BATCH;
  const base = adminClient().from('businesses').select(COLUMNS.join(', '));
  const { data, error } = await applyBusinessFilters(base, f)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + BATCH - 1)
    .returns<ExportRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Отметка «упёрлись в MAX_ROWS»: последняя разрешённая страница была полной — дальше, скорее всего, есть строки.
type Progress = { truncated: boolean };

// Все страницы по очереди; останавливается на неполной странице или на MAX_ROWS.
async function* exportRows(f: Filters, progress: Progress): AsyncGenerator<ExportRow[]> {
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await fetchPage(f, page);
    if (rows.length) yield rows;
    if (rows.length < BATCH) return;
  }
  progress.truncated = true;
}

// truncated в audit: обрезанная выгрузка видна в журнале, а не выглядит полной.
function filtersPayload(f: Filters, format: string, rows: number, truncated: boolean) {
  return { format, rows, truncated, status: f.status || null, city: f.city || null, vertical: f.vertical || null, q: f.q ? f.q.length : 0 };
}

function csvStream(f: Filters): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const progress: Progress = { truncated: false };
  const it = exportRows(f, progress);
  let count = 0;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(`${BOM}${CSV_HEADER}\n`));
    },
    async pull(controller) {
      try {
        const next = await it.next();
        if (next.done) {
          await audit('export_businesses', 'business', null, filtersPayload(f, 'csv', count, progress.truncated));
          controller.close();
          return;
        }
        count += next.value.length;
        controller.enqueue(enc.encode(next.value.map(csvLine).join('\n') + '\n'));
      } catch (e) {
        // Заголовки уже отправлены: обрываем поток — браузер покажет «ошибка загрузки», а не неполный файл как успешный.
        await logError('export', errorMessage(e), { format: 'csv', rows: count });
        controller.error(e);
      }
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}

async function xlsxResponse(f: Filters, base: string): Promise<Response> {
  const records: ReturnType<typeof xlsxRecord>[] = [];
  const progress: Progress = { truncated: false };
  for await (const chunk of exportRows(f, progress)) records.push(...chunk.map(xlsxRecord));
  const ws = XLSX.utils.json_to_sheet(records, { header: [...COLUMNS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Бизнесы');
  const buf: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
  await audit('export_businesses', 'business', null, filtersPayload(f, 'xlsx', records.length, progress.truncated));
  // XLSX собирается целиком — признак обрезки можно отдать заголовком (CSV-заголовки уходят раньше данных).
  const headers = new Headers({ ...NO_STORE, 'Content-Type': XLSX_TYPE, 'Content-Disposition': `attachment; filename="${base}.xlsx"` });
  if (progress.truncated) headers.set('X-Export-Truncated', String(MAX_ROWS));
  return new Response(new Uint8Array(buf), { headers });
}

export async function GET(req: Request): Promise<Response> {
  if (!(await isSuperAdmin())) return new Response('Нет доступа', { status: 403, headers: NO_STORE });
  const url = new URL(req.url);
  // Номер страницы списка игнорируется: выгружается вся выборка по фильтрам.
  const filters: Filters = readBusinessFilters(paramsFromUrl(url));
  const base = fileBase(filters.status, new Date());

  if (url.searchParams.get('format') === 'xlsx') {
    try {
      return await xlsxResponse(filters, base);
    } catch (e) {
      await logError('export', errorMessage(e), { format: 'xlsx' });
      return new Response('Не удалось сформировать файл', { status: 500, headers: NO_STORE });
    }
  }
  return new Response(csvStream(filters), {
    headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.csv"` },
  });
}
