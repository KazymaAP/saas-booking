// lib/analytics-summary.test.ts — Vitest: параметры отчёта, итоги, проценты, загрузка агрегатов (ТЗ §12.3, §13.8).
import { beforeEach, describe, expect, it, vi } from 'vitest';

// unstable_cache в тестах — прозрачная обёртка: проверяем саму загрузку, а не кэш Next.
vi.mock('next/cache', () => ({ unstable_cache: <T>(fn: T): T => fn }));
const rpcMock = vi.fn();
vi.mock('./supabase', () => ({ adminClient: () => ({ rpc: rpcMock }) }));

import {
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS,
  computeTotals,
  loadSummary,
  parseSummaryParams,
  percent,
  type SeriesPoint,
} from './analytics-summary';

const NOW = new Date('2026-10-15T12:00:00Z');
const BUSINESS_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function point(bucket: string, pageviews: number, bookings: number): SeriesPoint {
  return { bucket, pageviews, sessions: pageviews, visitors: pageviews, booking_open: 0, booking_submit: 0, phone_click: 0, map_open: 0, bookings };
}

const RPC_DATA: Record<string, unknown> = {
  analytics_refresh_if_stale: '2026-10-15T11:05:00+00:00',
  analytics_series: [point('2026-10-14', 10, 1), point('2026-10-15', 30, 3)],
  analytics_traffic_summary: { by_event: { pageview: 40 }, top_businesses: [] },
  analytics_business_summary: {
    total: 5, mrr: '1980', active_subscriptions: 2, contacted: 4, paid: 2, paid_total: 2,
    by_status: { client: 2 }, by_city: [], by_vertical: [],
  },
  analytics_outreach_summary: { by_channel: [], by_template: [], by_day: [] },
};

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockImplementation(async (fn: string) => ({ data: RPC_DATA[fn] ?? null, error: null }));
});

describe('parseSummaryParams', () => {
  it('по умолчанию — последние 30 дней, группировка по дням, общий отчёт', () => {
    const r = parseSummaryParams({}, NOW);
    expect(r).toEqual({ ok: true, params: { business_id: null, from: '2026-09-16', to: '2026-10-16', group_by: 'day' } });
    expect(DEFAULT_RANGE_DAYS).toBe(30);
  });

  it('принимает явные параметры', () => {
    const r = parseSummaryParams({ business_id: BUSINESS_ID, from: '2026-10-01', to: '2026-11-01', group_by: 'week' }, NOW);
    expect(r.ok && r.params).toEqual({ business_id: BUSINESS_ID, from: '2026-10-01', to: '2026-11-01', group_by: 'week' });
  });

  it('отклоняет мусор: business_id, даты, group_by', () => {
    expect(parseSummaryParams({ business_id: "1' or 1=1" }, NOW)).toEqual({ ok: false, error: 'invalid_params' });
    expect(parseSummaryParams({ from: '01.10.2026' }, NOW)).toEqual({ ok: false, error: 'invalid_params' });
    expect(parseSummaryParams({ group_by: 'year' }, NOW)).toEqual({ ok: false, error: 'invalid_params' });
    // Несуществующая дата: Date.parse её «чинит», Postgres — падает.
    expect(parseSummaryParams({ from: '2026-02-30', to: '2026-03-10' }, NOW)).toEqual({ ok: false, error: 'invalid_params' });
    expect(parseSummaryParams({ from: '2026-13-01', to: '2027-01-10' }, NOW)).toEqual({ ok: false, error: 'invalid_params' });
  });

  it('пустой, обратный и слишком длинный период', () => {
    expect(parseSummaryParams({ from: '2026-10-10', to: '2026-10-10' }, NOW)).toEqual({ ok: false, error: 'invalid_range' });
    expect(parseSummaryParams({ from: '2026-10-10', to: '2026-10-01' }, NOW)).toEqual({ ok: false, error: 'invalid_range' });
    expect(parseSummaryParams({ from: '2025-01-01', to: '2026-10-01' }, NOW)).toEqual({ ok: false, error: 'range_too_large' });
    expect(MAX_RANGE_DAYS).toBe(366);
  });
});

describe('percent / computeTotals', () => {
  it('percent: одна цифра после запятой, деление на ноль → 0', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(5, 0)).toBe(0);
  });

  it('суммирует ряд и считает конверсию просмотр → заявка', () => {
    expect(computeTotals([point('a', 10, 1), point('b', 30, 3)])).toEqual({
      pageviews: 40, sessions: 40, visitors: 40, bookings: 4, view_to_booking: 10,
    });
    expect(computeTotals([])).toEqual({ pageviews: 0, sessions: 0, visitors: 0, bookings: 0, view_to_booking: 0 });
  });
});

describe('loadSummary', () => {
  it('общий отчёт: ленивый refresh MV, ряд, трафик, бизнес-срез, рассылка', async () => {
    const s = await loadSummary({ business_id: null, from: '2026-10-01', to: '2026-10-16', group_by: 'day' });
    const called = rpcMock.mock.calls.map((c) => c[0]);
    expect(called).toEqual(expect.arrayContaining([
      'analytics_refresh_if_stale', 'analytics_series', 'analytics_traffic_summary', 'analytics_business_summary', 'analytics_outreach_summary',
    ]));
    expect(s.data_as_of).toBe('2026-10-15T11:05:00+00:00');
    expect(s.totals.view_to_booking).toBe(10);
    // numeric из Postgres приходит строкой — zod приводит к числу.
    expect(s.business?.mrr).toBe(1980);
    expect(s.outreach).not.toBeNull();
  });

  it('отчёт по бизнесу: без платформенных срезов, фильтр business_id уходит в RPC', async () => {
    const s = await loadSummary({ business_id: BUSINESS_ID, from: '2026-10-01', to: '2026-10-16', group_by: 'day' });
    expect(s.business).toBeNull();
    expect(s.outreach).toBeNull();
    const called = rpcMock.mock.calls.map((c) => c[0]);
    expect(called).not.toContain('analytics_business_summary');
    const seriesArgs = rpcMock.mock.calls.find((c) => c[0] === 'analytics_series')?.[1];
    expect(seriesArgs).toMatchObject({ p_business_id: BUSINESS_ID, p_group: 'day' });
  });

  it('сбой refresh не роняет отчёт', async () => {
    rpcMock.mockImplementation(async (fn: string) => (fn === 'analytics_refresh_if_stale'
      ? { data: null, error: { code: '42501' } }
      : { data: RPC_DATA[fn] ?? null, error: null }));
    const s = await loadSummary({ business_id: BUSINESS_ID, from: '2026-10-01', to: '2026-10-16', group_by: 'day' });
    expect(s.data_as_of).toBeNull();
    expect(s.totals.pageviews).toBe(40);
  });

  it('ошибка агрегата пробрасывается без деталей запроса', async () => {
    rpcMock.mockImplementation(async (fn: string) => (fn === 'analytics_series'
      ? { data: null, error: { code: 'PGRST202', message: 'secret details' } }
      : { data: RPC_DATA[fn] ?? null, error: null }));
    await expect(loadSummary({ business_id: BUSINESS_ID, from: '2026-10-01', to: '2026-10-16', group_by: 'day' }))
      .rejects.toThrow('rpc analytics_series: PGRST202');
  });

  it('неожиданная форма ответа RPC отклоняется схемой', async () => {
    rpcMock.mockImplementation(async (fn: string) => ({ data: fn === 'analytics_series' ? [{ bucket: 1 }] : RPC_DATA[fn], error: null }));
    await expect(loadSummary({ business_id: BUSINESS_ID, from: '2026-10-01', to: '2026-10-16', group_by: 'day' })).rejects.toThrow();
  });
});
