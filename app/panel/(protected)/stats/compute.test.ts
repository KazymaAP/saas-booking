// Тесты кэша статистики и постраничного чтения (лимит PostgREST 1000 строк).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/главная/lib/fake-db';

const fake = createFakeDb();
vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));

import { fetchAll, getStats } from './compute';

beforeEach(() => fake.reset());

describe('fetchAll', () => {
  it('читает страницы, пока страница полная', async () => {
    const pages = [[1, 2], [3, 4], [5]];
    const page = vi.fn(async (from: number) => ({ data: pages[from / 2] ?? [], error: null }));
    expect(await fetchAll<number>(page, 2)).toEqual([1, 2, 3, 4, 5]);
    expect(page).toHaveBeenCalledTimes(3);
  });
  it('ошибка страницы — исключение (частичный снимок не сохраняется)', async () => {
    await expect(fetchAll(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom');
  });
});

describe('getStats', () => {
  it('свежий кэш отдаётся без пересчёта (один запрос к settings)', async () => {
    const snap = { computed_at: new Date().toISOString(), totals: {}, funnel: [] };
    fake.reply('settings', { data: { value: snap } });
    const r = await getStats(30);
    expect(r.cached).toBe(true);
    expect(fake.queries.map((q) => q.table)).toEqual(['settings']);
  });
  it('устаревший кэш — пересчёт и запись снимка в settings', async () => {
    fake.reply('settings', { data: { value: { computed_at: '2000-01-01T00:00:00Z', totals: {}, funnel: [] } } });
    fake.reply('businesses', { data: [{ id: 'a', status: 'client', city: 'Уфа', vertical_template_id: null, paid_initial_at: '2026-10-10T00:00:00Z', reply_received_at: null }] }, { data: [{ subscription_price: '1000' }] });
    const r = await getStats(30);
    expect(r.cached).toBe(false);
    expect(r.snapshot.totals.mrr).toBe(1000);
    expect(r.snapshot.totals.clients).toBe(1);
    expect(fake.find('settings', 'upsert')).toHaveLength(1);
  });
  it('сбой справочника ниш — исключение, снимок не пишется в кэш', async () => {
    fake.reply('settings', { data: null });
    fake.reply('businesses', { data: [] }, { data: [] });
    fake.reply('vertical_templates', { data: null, error: { message: 'vt down' } });
    await expect(getStats(30)).rejects.toThrow('vt down');
    expect(fake.find('settings', 'upsert')).toHaveLength(0);
  });
});
