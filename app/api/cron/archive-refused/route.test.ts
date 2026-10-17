// app/api/cron/archive-refused/route.test.ts — отказы старше 30 дней → archived.
import { describe, expect, it } from 'vitest';
import { archiveRefused } from '@/lib/cron-jobs/archive-refused';
import { TEST_NOW } from '@/lib/test-utils/supabase-mock';
import { daysFrom, memoryContext } from '@/lib/test-utils/context';

describe('archive-refused', () => {
  it('refused > 30 дней → archived; свежий отказ, без даты и чужой статус — без изменений; повтор — 0', async () => {
    const ctx = memoryContext({
      businesses: [
        { id: 'old', status: 'refused', refused_at: daysFrom(TEST_NOW, -31) },
        { id: 'fresh', status: 'refused', refused_at: daysFrom(TEST_NOW, -29) },
        { id: 'nodate', status: 'refused', refused_at: null },
        { id: 'client', status: 'client', refused_at: daysFrom(TEST_NOW, -90) },
      ],
    });
    expect(await archiveRefused(ctx)).toEqual({ archived: 1 });
    const status = (id: string) => ctx.mem.tables.businesses?.find((b) => b.id === id)?.status;
    expect([status('old'), status('fresh'), status('nodate'), status('client')]).toEqual(['archived', 'refused', 'refused', 'client']);
    expect(await archiveRefused(ctx)).toEqual({ archived: 0 });
  });

  it('ошибка БД → исключение', async () => {
    const ctx = memoryContext({}, { failOn: () => 'db down' });
    await expect(archiveRefused(ctx)).rejects.toThrow('db down');
  });
});
