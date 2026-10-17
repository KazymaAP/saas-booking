// app/api/cron/cleanup-prototypes/route.test.ts — preview_ready > 90 дней → archived; через 30 дней после архивации → удаление.
import { describe, expect, it } from 'vitest';
import { cleanupPrototypes } from '@/lib/cron-jobs/cleanup-prototypes';
import { TEST_NOW } from '@/lib/test-utils/supabase-mock';
import { daysFrom, memoryContext } from '@/lib/test-utils/context';

describe('cleanup-prototypes', () => {
  it('старый прототип архивируется и получает отметку; свежий — нет', async () => {
    const ctx = memoryContext({
      businesses: [
        { id: 'old', status: 'preview_ready', created_at: daysFrom(TEST_NOW, -91) },
        { id: 'new', status: 'preview_ready', created_at: daysFrom(TEST_NOW, -10) },
      ],
      photos: [],
    });
    const result = await cleanupPrototypes(ctx);
    expect(result).toMatchObject({ archived: 1, deleted: 0 });
    expect(ctx.mem.tables.cron_marks?.map((m) => m.key)).toEqual(['old']);
  });

  it('удаляет только заархивированные задачей > 30 дней назад; бывший клиент в archived не трогается', async () => {
    const ctx = memoryContext({
      businesses: [
        { id: 'proto', status: 'archived', created_at: daysFrom(TEST_NOW, -200) },
        { id: 'ex-client', status: 'archived', created_at: daysFrom(TEST_NOW, -400) },
        { id: 'recent', status: 'archived', created_at: daysFrom(TEST_NOW, -100) },
      ],
      photos: [],
      cron_marks: [
        { job: 'cleanup-prototypes', key: 'proto', created_at: daysFrom(TEST_NOW, -31) },
        { job: 'cleanup-prototypes', key: 'recent', created_at: daysFrom(TEST_NOW, -5) },
      ],
    });
    const result = await cleanupPrototypes(ctx);
    expect(result).toMatchObject({ deleted: 1, restored: 0, failed: 0 });
    expect(ctx.mem.tables.businesses?.map((b) => b.id).sort()).toEqual(['ex-client', 'recent']);
    expect(ctx.mem.tables.cron_marks?.map((m) => m.key)).toEqual(['recent']);
  });

  it('прототип вернули из архива → не удаляется, отметка снимается', async () => {
    const ctx = memoryContext({
      businesses: [{ id: 'back', status: 'approved', created_at: daysFrom(TEST_NOW, -200) }],
      photos: [],
      cron_marks: [{ job: 'cleanup-prototypes', key: 'back', created_at: daysFrom(TEST_NOW, -40) }],
    });
    const result = await cleanupPrototypes(ctx);
    expect(result).toMatchObject({ deleted: 0, restored: 1 });
    expect(ctx.mem.tables.businesses?.length).toBe(1);
    expect(ctx.mem.tables.cron_marks?.length).toBe(0);
  });

  it('ошибка БД → исключение', async () => {
    const ctx = memoryContext({}, { failOn: () => 'db down' });
    await expect(cleanupPrototypes(ctx)).rejects.toThrow('db down');
  });
});
