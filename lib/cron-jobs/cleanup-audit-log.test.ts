// lib/cron-jobs/cleanup-audit-log.test.ts — страховочная очистка вызывает cron_retention для каждой таблицы политики.
import { describe, expect, it } from 'vitest';
import { RETENTION_TABLES, cleanupAuditLog } from './cleanup-audit-log';
import { memoryContext } from '../test-utils/context';

describe('cleanup-audit-log', () => {
  it('вызывает cron_retention по всем таблицам и возвращает число удалённых', async () => {
    const ctx = memoryContext({}, { rpc: { cron_retention: (args) => (args.p_table === 'audit_log' ? 7 : 0) } });
    const result = await cleanupAuditLog(ctx);
    expect(ctx.mem.rpcCalls.map((c) => c.args.p_table)).toEqual([...RETENTION_TABLES]);
    expect(result.audit_log).toBe(7);
  });

  it('ошибка RPC → исключение (500 + logError)', async () => {
    const ctx = memoryContext({}, { failOn: (q) => (q.table === 'rpc:cron_retention' ? 'no function' : null) });
    await expect(cleanupAuditLog(ctx)).rejects.toThrow('no function');
  });

  it('сбой одной таблицы не останавливает остальные; в конце — исключение со списком', async () => {
    const ctx = memoryContext({}, {
      failOn: (q) => (q.table === 'rpc:cron_retention' && (q.payload as { p_table?: string } | null)?.p_table === RETENTION_TABLES[0]
        ? 'lock timeout' : null),
    });
    await expect(cleanupAuditLog(ctx)).rejects.toThrow(`${RETENTION_TABLES[0]}: lock timeout`);
    expect(ctx.mem.rpcCalls.map((c) => c.args.p_table)).toEqual([...RETENTION_TABLES]);
  });

  it('cron_retention вернул null (ошибка поймана внутри SQL) → исключение, остальные таблицы обработаны', async () => {
    const ctx = memoryContext({}, { rpc: { cron_retention: (args) => (args.p_table === 'audit_log' ? null : 3) } });
    await expect(cleanupAuditLog(ctx)).rejects.toThrow('audit_log: ошибка внутри cron_retention');
    expect(ctx.mem.rpcCalls.length).toBe(RETENTION_TABLES.length);
  });
});
