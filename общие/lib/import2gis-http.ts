// lib/import2gis-http.ts — обработка запроса загрузки 2GIS (ядро app/api/import/2gis/route.ts).
// Вынесено из route.ts: Next.js разрешает экспортировать из route только обработчики, а логику нужно тестировать.
import { z } from 'zod';
import { DEFAULT_FILTER, ImportError, MAX_FILE_BYTES, importRows, parseWorkbook, type ImportStats } from './import2gis';
import type { ImportStore } from './import2gis-store';
import type { SupabaseClient } from '@supabase/supabase-js';

// Запас на multipart-обёртку и текстовые поля поверх 10 МБ файла.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_FILTER_LENGTH = 100;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Браузеры на Windows без Office отдают xlsx как octet-stream или пустой тип.
const ALLOWED_MIME: ReadonlySet<string> = new Set([XLSX_MIME, 'application/octet-stream', '']);
// Сигнатура ZIP (xlsx — это zip-архив): «PK\x03\x04».
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

export type ImportReason = 'auth' | 'too_large' | 'form' | 'file' | 'type' | 'filter' | ImportError['reason'] | 'server';

export type ImportResponse = { status: number; body: { ok: true; stats: ImportStats } | { ok: false; reason: ImportReason; message?: string } };

export type ImportDeps = {
  isSuperAdmin: () => Promise<boolean>;
  db: () => SupabaseClient | ImportStore;
  audit: (stats: ImportStats, fileName: string) => Promise<unknown>;
  logError: (message: string, payload: Record<string, unknown>) => Promise<unknown>;
};

const FieldsSchema = z.object({
  // Пустой фильтр означал бы «все рубрики» — для импорта шиномонтажей это почти всегда ошибка оператора.
  filter: z.string().trim().min(1).max(MAX_FILTER_LENGTH).default(DEFAULT_FILTER),
  dry_run: z.enum(['1', 'true', 'on']).optional(),
});

const fail = (status: number, reason: ImportReason, message?: string): ImportResponse => ({ status, body: { ok: false, reason, ...(message ? { message } : {}) } });

const isZip = (data: Uint8Array): boolean => ZIP_MAGIC.every((b, i) => data[i] === b);

// Проверка размера ДО чтения тела: formData() буферизует весь запрос в памяти.
function declaredTooLarge(req: Request): boolean {
  const declared = Number(req.headers.get('content-length') ?? '0');
  return Number.isFinite(declared) && declared > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES;
}

type ParsedForm = { file: File; filter: string; dryRun: boolean };

async function readForm(req: Request): Promise<ParsedForm | ImportResponse> {
  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, 'form');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail(400, 'file');
  if (file.size > MAX_FILE_BYTES) return fail(413, 'too_large');
  if (!ALLOWED_MIME.has(file.type) || !/\.xlsx$/i.test(file.name)) return fail(415, 'type');
  const raw = { filter: form.get('filter') ?? undefined, dry_run: form.get('dry_run') ?? undefined };
  const fields = FieldsSchema.safeParse({
    filter: typeof raw.filter === 'string' && raw.filter.trim() !== '' ? raw.filter : undefined,
    dry_run: typeof raw.dry_run === 'string' ? raw.dry_run : undefined,
  });
  if (!fields.success) return fail(400, 'filter');
  return { file, filter: fields.data.filter, dryRun: fields.data.dry_run !== undefined };
}

export async function handleImport(req: Request, deps: ImportDeps): Promise<ImportResponse> {
  if (!(await deps.isSuperAdmin())) return fail(401, 'auth');
  if (declaredTooLarge(req)) return fail(413, 'too_large');
  const parsed = await readForm(req);
  if ('status' in parsed) return parsed;
  const data = new Uint8Array(await parsed.file.arrayBuffer());
  if (!isZip(data)) return fail(415, 'type');
  try {
    const rows = parseWorkbook(data);
    const stats = await importRows(deps.db(), rows, { filter: parsed.filter, dryRun: parsed.dryRun });
    if (!parsed.dryRun) await deps.audit(stats, parsed.file.name).catch(() => undefined);
    return { status: 200, body: { ok: true, stats } };
  } catch (e) {
    // Ошибка файла (пустой, нет колонок) — вина пользователя, 422 с понятным текстом; прочее — 500 и запись в журнал.
    if (e instanceof ImportError) return fail(422, e.reason, e.message);
    await deps.logError(e instanceof Error ? e.message : 'ошибка импорта', { file: parsed.file.name.slice(0, 200) });
    return fail(500, 'server');
  }
}
