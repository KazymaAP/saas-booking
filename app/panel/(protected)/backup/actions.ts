'use server';
// app/panel/(protected)/backup/actions.ts — ручной запуск бэкапа (кнопка «Сделать копию сейчас»).
// isSuperAdmin проверяется в action: layout защищает страницу, но не прямой вызов server action.
// Раньше action ходил HTTP-запросом сам к себе с CRON_SECRET — теперь вызывает performBackup напрямую.
import { revalidatePath } from 'next/cache';
import { isSuperAdmin } from '@/lib/admin-session';
import { performBackup } from '@/lib/backup';
import { backupJobDeps } from '@/lib/backup-deps';
import { hitRateLimit } from '@/lib/rate-limit';

export type BackupActionResult = { ok: boolean; message: string };

const MANUAL_LIMIT_PER_HOUR = 6; // ручной запуск — тяжёлая операция, защищаемся от серии кликов
const HOUR_S = 3_600;

export async function runBackupNow(): Promise<BackupActionResult> {
  if (!(await isSuperAdmin())) return { ok: false, message: 'Нет доступа' };
  const allowed = await hitRateLimit('backup_manual', MANUAL_LIMIT_PER_HOUR, HOUR_S).catch(() => true);
  if (!allowed) return { ok: false, message: 'Слишком часто. Попробуйте через час.' };
  const r = await performBackup(backupJobDeps(), 'manual');
  revalidatePath('/panel/backup');
  if (!r.ok) return { ok: false, message: `Копия не создана: ${r.error.slice(0, 200)}` };
  const rows = Object.values(r.counts).reduce((a, b) => a + b, 0);
  return { ok: true, message: `Копия ${r.file} создана: ${rows} строк, ${Math.max(1, Math.round(r.bytes / 1024))} КБ.` };
}
