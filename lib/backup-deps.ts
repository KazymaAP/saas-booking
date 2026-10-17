// lib/backup-deps.ts — боевые зависимости для performBackup / handleRestoreRequest (Supabase, Telegram, журнал, audit).
// Вынесено из lib/backup.ts, чтобы модуль бэкапа не тянул сетевые модули в unit-тесты.
import { RESTORE_LOCK_TTL_S, supabaseBackupDb, type BackupJobDeps, type RestoreLock, type RestoreRequestDeps } from './backup';
import { purgeOldPings } from './license-server';
import { notifyAdmin } from './admin-notify';
import { hitRateLimit } from './rate-limit';
import { adminClient } from './supabase';
import { logError } from './log';
import { audit } from './audit';

const RESTORE_LOCK_BUCKET = 'lock:backup_restore';

function logCron(message: string, payload: Record<string, unknown>): Promise<void> {
  return logError('cron', message, payload).then(() => undefined);
}

// audit() бросает при сбое БД — основная операция уже выполнена, поэтому сбой журнала уходит в журнал ошибок.
function auditBackup(action: string, payload: Record<string, unknown>): Promise<void> {
  return audit(action, 'backup', null, payload)
    .catch(() => logError('cron', `audit ${action} не записан`))
    .then(() => undefined);
}

// Блокировка на таблице rate_limits: 1 захват за окно TTL; release удаляет запись, чтобы следующий restore
// мог стартовать сразу. hitRateLimit не атомарен (select → update), но окно гонки — миллисекунды двойного клика,
// а сам restore идемпотентен, так что худший случай — повторная запись тех же строк.
function restoreLock(): RestoreLock {
  return {
    acquire: () => hitRateLimit(RESTORE_LOCK_BUCKET, 1, RESTORE_LOCK_TTL_S),
    async release() {
      await adminClient().from('rate_limits').delete().eq('bucket', RESTORE_LOCK_BUCKET)
        .then(() => undefined, () => undefined); // не снялась — истечёт по TTL
    },
  };
}

export function backupJobDeps(): BackupJobDeps {
  return { db: supabaseBackupDb(), purge_pings: purgeOldPings, notify: notifyAdmin, log_error: logCron, audit: auditBackup };
}

export function restoreRequestDeps(): RestoreRequestDeps {
  return { db: supabaseBackupDb(), lock: restoreLock(), notify: notifyAdmin, log_error: logCron, audit: auditBackup };
}
