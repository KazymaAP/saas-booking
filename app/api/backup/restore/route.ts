// app/api/backup/restore/route.ts — восстановление из JSON-копии в bucket backups (ТЗ 4.0 §16.7, §5.4 /panel/backup).
// Только супер-админ. Подтверждение: confirm === 'ВОССТАНОВИТЬ'. Логика — handleRestoreRequest (lib/backup.ts):
// проверка дампа, порядок родители → дети, batch 500, upsert по id, отчёт по таблицам, audit.
// Ответы: 200 — всё восстановлено; 207 — частично (отчёт); 400 — confirm/файл/формат/контрольная сумма; 401; 404;
// 409 — уже идёт; 503 — недоступно хранилище блокировки.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSuperAdmin } from '@/lib/admin-session';
import { handleRestoreRequest } from '@/lib/backup';
import { restoreRequestDeps } from '@/lib/backup-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BODY_BYTES = 1_024; // тело — только имя файла и слово подтверждения
const Body = z.object({ file: z.string().max(64), confirm: z.string().max(64) });

export async function POST(req: Request): Promise<Response> {
  if (!(await isSuperAdmin())) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 401 });
  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, reason: 'too_large' }, { status: 413 });
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, reason: 'validation' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'validation' }, { status: 400 });
  const r = await handleRestoreRequest(parsed.data, restoreRequestDeps());
  return NextResponse.json(r.body, { status: r.http_status, headers: { 'Cache-Control': 'no-store' } });
}
