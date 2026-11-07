// lib/cron-jobs/process-transfers.test.ts — выкуп кода: после support_until — заглушка, ещё через 7 дней — transferred_out.
import { describe, expect, it } from 'vitest';
import { processTransfers } from './process-transfers';
import { moscowDate } from './shared';
import { TEST_NOW } from '../test-utils/supabase-mock';
import { memoryContext } from '../test-utils/context';

describe('process-transfers', () => {
  it('заглушка после support_until, transferred_out через 7 дней; повтор ничего не меняет', async () => {
    const transferred = TEST_NOW.toISOString();
    const ctx = memoryContext({
      businesses: [
        { id: 'stub', status: 'client', subscription_active: true, code_transferred_at: transferred, support_until: moscowDate(TEST_NOW, -1) },
        { id: 'out', status: 'client', subscription_active: false, code_transferred_at: transferred, support_until: moscowDate(TEST_NOW, -8) },
        { id: 'active', status: 'client', subscription_active: true, code_transferred_at: transferred, support_until: moscowDate(TEST_NOW, 5) },
        { id: 'plain', status: 'client', subscription_active: true, code_transferred_at: null, support_until: moscowDate(TEST_NOW, -30) },
      ],
    });
    expect(await processTransfers(ctx)).toEqual({ stubbed: 1, transferred_out: 1 });
    const row = (id: string) => ctx.mem.tables.businesses?.find((b) => b.id === id);
    expect(row('stub')?.subscription_active).toBe(false);
    expect(row('out')?.status).toBe('transferred_out');
    expect(row('active')?.subscription_active).toBe(true);
    expect(row('plain')?.subscription_active).toBe(true);
    expect(await processTransfers(ctx)).toEqual({ stubbed: 0, transferred_out: 0 });
  });

  it('ошибка БД → исключение', async () => {
    const ctx = memoryContext({}, { failOn: () => 'db down' });
    await expect(processTransfers(ctx)).rejects.toThrow('db down');
  });
});
