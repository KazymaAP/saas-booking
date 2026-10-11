// app/api/backup/restore/route.ts — восстановление из JSON-копии в bucket backups (ТЗ §5.4 /panel/backup, §35).
// Только супер-админ. Нужно подтверждение: в теле запроса confirm = "ВОССТАНОВИТЬ". Таблицы пишутся upsert по id.
import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/admin-session';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Порядок важен: сначала родительские таблицы, потом дочерние (внешние ключи).
const TABLES = ['vertical_templates', 'businesses', 'services', 'photos', 'admin_users', 'bookings', 'outreach_log', 'emails_outgoing', 'licenses'] as const;

export async function POST(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 401 });
  const body = await req.json().catch(() => null) as { file?: string; confirm?: string } | null;
  if (!body?.file || body.confirm !== 'ВОССТАНОВИТЬ' || !/^backup-\d{4}-\d{2}-\d{2}\.json$/.test(body.file)) {
    return NextResponse.json({ ok: false, reason: 'confirm' }, { status: 400 });
  }
  const db = adminClient();
  const { data: file, error } = await db.storage.from('backups').download(body.file);
  if (error || !file) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });

  let dump: Record<string, unknown[]>;
  try {
    dump = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ ok: false, reason: 'parse' }, { status: 400 });
  }

  const result: Record<string, { rows: number; error?: string }> = {};
  for (const t of TABLES) {
    const rows = (dump[t] ?? []) as Record<string, unknown>[];
    if (!rows.length) { result[t] = { rows: 0 }; continue; }
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: e } = await db.from(t).upsert(chunk, { onConflict: 'id' });
      if (e) {
        result[t] = { rows: written, error: e.message };
        await logError('cron', `восстановление ${t}: ${e.message}`);
        break;
      }
      written += chunk.length;
    }
    if (!result[t]) result[t] = { rows: written };
  }
  await audit('backup_restore', 'backup', null, { file: body.file, result });
  return NextResponse.json({ ok: true, result });
}
