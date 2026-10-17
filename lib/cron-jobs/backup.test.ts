// lib/cron-jobs/backup.test.ts — JSON-бэкап: постраничное чтение, ошибка → без файла, удаление старых копий.
import { describe, expect, it } from 'vitest';
import { BACKUP_BUCKET, BACKUP_TABLES, PAGE_SIZE, backup, expiredBackups } from './backup';
import { TEST_NOW } from '../test-utils/supabase-mock';
import { memoryContext } from '../test-utils/context';
import type { Row } from '../test-utils/memory-db';

const rows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: String(i).padStart(6, '0') }));

describe('backup', () => {
  it('читает таблицу больше одной страницы целиком (раньше обрезалось до max-rows)', async () => {
    const ctx = memoryContext({ bookings: rows(PAGE_SIZE + 5) });
    const result = await backup(ctx);
    expect(result.rows_bookings).toBe(PAGE_SIZE + 5);
    expect(result.file).toBe('backup-2026-10-15.json');
    expect(ctx.mem.storage[BACKUP_BUCKET]).toContain('backup-2026-10-15.json');
    const bookingPages = ctx.mem.queries.filter((q) => q.table === 'bookings');
    expect(bookingPages.length).toBe(2);
    expect(BACKUP_TABLES.every((t) => typeof result[`rows_${t}`] === 'number')).toBe(true);
  });

  it('ошибка чтения таблицы → исключение, файл не записан', async () => {
    const ctx = memoryContext({}, { failOn: (q) => (q.table === 'licenses' ? 'permission denied' : null) });
    await expect(backup(ctx)).rejects.toThrow('permission denied');
    expect(ctx.mem.storage[BACKUP_BUCKET] ?? []).toEqual([]);
  });

  it('сбой загрузки в Storage → исключение', async () => {
    const ctx = memoryContext({}, { failStorage: (_, method) => (method === 'upload' ? 'quota' : null) });
    await expect(backup(ctx)).rejects.toThrow('quota');
  });

  it('удаляет копии старше 30 дней, повторный запуск в тот же день перезаписывает файл', async () => {
    const ctx = memoryContext();
    ctx.mem.storage[BACKUP_BUCKET] = ['backup-2026-08-01.json', 'backup-2026-10-01.json', 'other.txt'];
    const first = await backup(ctx);
    const second = await backup(ctx);
    expect(first.removed).toBe(1);
    expect(second.removed).toBe(0);
    expect(ctx.mem.storage[BACKUP_BUCKET]?.sort()).toEqual(['backup-2026-10-01.json', 'backup-2026-10-15.json', 'other.txt']);
  });

  it('expiredBackups: граница 30 дней, чужие файлы не трогаются', () => {
    expect(expiredBackups(['backup-2026-09-15.json', 'backup-2026-09-14.json', 'x-2020-01-01.json'], TEST_NOW))
      .toEqual(['backup-2026-09-14.json']);
  });
});
