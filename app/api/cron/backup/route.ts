// app/api/cron/backup/route.ts — ежедневный JSON-бэкап 9 таблиц в приватный bucket backups (ТЗ 4.0 §16.7).
// Защита: Authorization: Bearer CRON_SECRET. Статический маршрут имеет приоритет над app/api/cron/[job],
// поэтому старый job 'backup' (7 таблиц, обрезка до 1000 строк) больше не вызывается по этому пути.
// Логика — lib/backup.ts (performBackup): сбор с пагинацией, загрузка, retention 30 дней, retention license_pings.
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron';
import { backupJobDeps } from '@/lib/backup-deps';
import { performBackup } from '@/lib/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // сбор идёт страницами по 1000 строк; запас под рост базы (требование ≤ 10 мин)

export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const r = await performBackup(backupJobDeps(), 'cron');
  // Ответ без данных таблиц: только имя файла, размер и счётчики строк.
  return NextResponse.json(r, { status: r.ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
