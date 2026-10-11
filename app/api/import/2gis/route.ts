// app/api/import/2gis/route.ts — загрузка выгрузки 2GIS из интерфейса /panel/businesses (ТЗ §5.4, §5.7). Только супер-админ.
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { isSuperAdmin } from '@/lib/admin-session';
import { adminClient } from '@/lib/supabase';
import { importRows } from '@/lib/import2gis';
import { audit } from '@/lib/audit';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const filter = String(form?.get('filter') ?? 'шин');
  const dryRun = form?.get('dry_run') === '1';
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ ok: false, reason: 'file' }, { status: 400 });
  }
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const stats = await importRows(adminClient(), rows, { filter, dryRun });
    if (!dryRun) await audit('import_2gis', 'import', null, { file: file.name, ...stats, errors: stats.errors.length });
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    await logError('import', (e as Error).message, { file: file.name });
    return NextResponse.json({ ok: false, reason: 'parse' }, { status: 500 });
  }
}
