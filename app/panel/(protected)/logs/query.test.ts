// Тесты выборки журнала: условия SQL по вкладке и фильтрам, ровно 50 строк, повторное маскирование ПД.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { argOf, createFakeDb } from '../_lib/fake-db';

const fake = createFakeDb();
vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));

import { readLogFilters } from './filters';
import { LOG_PAGE, loadLogs } from './query';

const row = (i: number) => ({ id: `id-${i}`, action: 'error:email', entity: 'email', entity_id: null, payload: { message: `m${i}` }, created_at: '2026-10-01T00:00:00Z' });

beforeEach(() => fake.reset());

describe('loadLogs', () => {
  it('вкладка ошибок + источник: eq по action, поиск по payload->>message', async () => {
    await loadLogs(readLogFilters({ source: 'email', q: 'timeout' }));
    const q = fake.queries[0];
    expect(q && argOf(q, 'eq', 'action')).toBe('error:email');
    expect(q && argOf(q, 'ilike', 'payload->>message')).toBe('%timeout%');
  });
  it('вкладка аудита без действия исключает ошибки', async () => {
    await loadLogs(readLogFilters({ tab: 'audit', entity: 'business' }));
    const q = fake.queries[0];
    expect(q?.calls.some((c) => c.method === 'not' && c.args[0] === 'action')).toBe(true);
    expect(q && argOf(q, 'eq', 'entity')).toBe('business');
  });
  it('страница: range с запасом в 1 строку, hasNext по лишней строке', async () => {
    fake.reply('audit_log', { data: Array.from({ length: LOG_PAGE + 1 }, (_, i) => row(i)) });
    const res = await loadLogs(readLogFilters({ page: '3' }));
    expect(res.rows).toHaveLength(LOG_PAGE);
    expect(res.hasNext).toBe(true);
    const range = fake.queries[0]?.calls.find((c) => c.method === 'range');
    expect(range?.args).toEqual([100, 150]);
  });
  it('старые записи с ПД маскируются при показе', async () => {
    fake.reply('audit_log', { data: [{ ...row(1), payload: { message: 'fail for ivan@mail.ru', password: 'x' } }] });
    const res = await loadLogs(readLogFilters({}));
    expect(JSON.stringify(res.rows[0]?.payload)).not.toContain('ivan@mail.ru');
    expect(res.rows[0]?.payload?.password).toBe('[скрыто]');
  });
  it('ошибка БД — failed, пустой список', async () => {
    fake.reply('audit_log', { error: { message: 'boom' } });
    const res = await loadLogs(readLogFilters({}));
    expect(res).toEqual({ rows: [], hasNext: false, failed: true });
  });
});
