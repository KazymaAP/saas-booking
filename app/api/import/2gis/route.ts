// app/api/import/2gis/route.ts — загрузка выгрузки 2GIS из /panel/businesses (ТЗ §13.2 шаг 1). Только супер-админ.
// POST multipart: file (.xlsx, до 10 МБ), filter (подстрока рубрики, по умолчанию «шин»), dry_run=1 — без записи.
// Ответ: { ok: true, stats } или { ok: false, reason, message? }. Логика — lib/import2gis-http.ts.
import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/admin-session';
import { audit } from '@/lib/audit';
import { handleImport } from '@/lib/import2gis-http';
import { logError } from '@/lib/log';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const res = await handleImport(req, {
    isSuperAdmin,
    db: adminClient,
    audit: (stats, file) => audit('import_2gis', 'import', null, { file: file.slice(0, 200), ...stats, errors: stats.errors.length }),
    logError: (message, payload) => logError('import', message, payload),
  });
  return NextResponse.json(res.body, { status: res.status, headers: { 'Cache-Control': 'no-store' } });
}
