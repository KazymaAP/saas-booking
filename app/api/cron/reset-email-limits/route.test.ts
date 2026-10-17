// app/api/cron/reset-email-limits/route.test.ts — сброс sent_today раз в сутки, повтор в тот же день не обнуляет.
import { describe, expect, it } from 'vitest';
import { resetDay, resetEmailLimits } from '@/lib/cron-jobs/reset-email-limits';
import { TEST_NOW } from '@/lib/test-utils/supabase-mock';
import { memoryContext } from '@/lib/test-utils/context';

describe('reset-email-limits', () => {
  it('сбрасывает вчерашние и новые ящики; сегодняшний не трогает', async () => {
    const today = resetDay(TEST_NOW);
    const ctx = memoryContext({
      email_accounts: [
        { id: 'a', sent_today: 50, last_reset: '2026-10-14' },
        { id: 'b', sent_today: 7, last_reset: null },
        { id: 'c', sent_today: 12, last_reset: today },
      ],
    });
    expect(await resetEmailLimits(ctx)).toEqual({ reset: 2, day: today });
    expect(ctx.mem.tables.email_accounts?.map((a) => a.sent_today)).toEqual([0, 0, 12]);
  });

  it('повторный запуск в тот же день не обнуляет счётчик второй раз', async () => {
    const ctx = memoryContext({ email_accounts: [{ id: 'a', sent_today: 50, last_reset: '2026-10-14' }] });
    await resetEmailLimits(ctx);
    const row = ctx.mem.tables.email_accounts?.[0];
    if (row !== undefined) row.sent_today = 3;
    expect((await resetEmailLimits(ctx)).reset).toBe(0);
    expect(ctx.mem.tables.email_accounts?.[0]?.sent_today).toBe(3);
  });

  it('ошибка БД → исключение', async () => {
    const ctx = memoryContext({}, { failOn: () => 'db down' });
    await expect(resetEmailLimits(ctx)).rejects.toThrow('db down');
  });
});
