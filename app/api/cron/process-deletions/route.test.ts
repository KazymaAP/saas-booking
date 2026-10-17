// app/api/cron/process-deletions/route.test.ts — pending_deletion с наступившей датой → удаление вместе с фото.
import { describe, expect, it } from 'vitest';
import { processDeletions } from '@/lib/cron-jobs/process-deletions';
import { PHOTOS_BUCKET } from '@/lib/cron-jobs/business-removal';
import { TEST_NOW } from '@/lib/test-utils/supabase-mock';
import { daysFrom, memoryContext } from '@/lib/test-utils/context';

function setup(options: { storageFails?: boolean } = {}) {
  const ctx = memoryContext({
    businesses: [
      { id: 'due', status: 'pending_deletion', deletion_scheduled_at: daysFrom(TEST_NOW, -1) },
      { id: 'later', status: 'pending_deletion', deletion_scheduled_at: daysFrom(TEST_NOW, 5) },
      { id: 'client', status: 'client', deletion_scheduled_at: daysFrom(TEST_NOW, -1) },
    ],
    photos: [{ business_id: 'due', path: 'due/1.jpg' }, { business_id: 'later', path: 'later/1.jpg' }],
  }, { failStorage: () => (options.storageFails === true ? 'storage down' : null) });
  ctx.mem.storage[PHOTOS_BUCKET] = ['due/1.jpg', 'later/1.jpg'];
  return ctx;
}

describe('process-deletions', () => {
  it('удаляет только наступившие pending_deletion и их фото; повтор — 0', async () => {
    const ctx = setup();
    expect(await processDeletions(ctx)).toEqual({ due: 1, deleted: 1, failed: 0 });
    expect(ctx.mem.tables.businesses?.map((b) => b.id).sort()).toEqual(['client', 'later']);
    expect(ctx.mem.storage[PHOTOS_BUCKET]).toEqual(['later/1.jpg']);
    expect(await processDeletions(ctx)).toEqual({ due: 0, deleted: 0, failed: 0 });
  });

  it('Storage недоступен → бизнес не удаляется (файлы не осиротеют), ошибка в журнале', async () => {
    const ctx = setup({ storageFails: true });
    expect(await processDeletions(ctx)).toEqual({ due: 1, deleted: 0, failed: 1 });
    expect(ctx.mem.tables.businesses?.some((b) => b.id === 'due')).toBe(true);
    expect(ctx.logMock.errors[0]?.message).toContain('storage down');
  });

  it('ошибка БД → исключение', async () => {
    const ctx = memoryContext({}, { failOn: () => 'db down' });
    await expect(processDeletions(ctx)).rejects.toThrow('db down');
  });
});
