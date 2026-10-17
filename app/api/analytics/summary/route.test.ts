// app/api/analytics/summary/route.test.ts — Vitest: права, параметры и кэш-заголовки /api/analytics/summary.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const superAdminMock = vi.fn();
const ownerMock = vi.fn();
const loadMock = vi.fn();
const logMock = vi.fn();

vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => superAdminMock() }));
vi.mock('@/lib/owner-session', () => ({ currentOwner: (slug: string) => ownerMock(slug) }));
vi.mock('@/lib/log', () => ({ logError: (...args: unknown[]) => logMock(...args) }));
vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: 'salon' }, error: null }) }) }) }),
  }),
}));
vi.mock('@/lib/analytics-summary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics-summary')>();
  return { ...actual, loadSummary: (...args: unknown[]) => loadMock(...args) };
});

import { GET } from './route';

const BUSINESS_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function get(query: string): Request {
  return new Request(`https://zapishisya.ru/api/analytics/summary${query}`);
}

beforeEach(() => {
  superAdminMock.mockReset().mockResolvedValue(false);
  ownerMock.mockReset().mockResolvedValue(null);
  loadMock.mockReset().mockResolvedValue({ totals: { pageviews: 1 } });
  logMock.mockReset();
});

describe('GET /api/analytics/summary', () => {
  it('аноним → 403, данные не грузятся', async () => {
    const res = await GET(get(`?business_id=${BUSINESS_ID}`));
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('супер-админ: общий отчёт, private-кэш 60 c', async () => {
    superAdminMock.mockResolvedValue(true);
    const res = await GET(get('?from=2026-10-01&to=2026-10-16&group_by=week'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=60');
    expect(res.headers.get('vary')).toBe('Cookie');
    await expect(res.json()).resolves.toMatchObject({ ok: true, totals: { pageviews: 1 } });
    expect(loadMock).toHaveBeenCalledWith({ business_id: null, from: '2026-10-01', to: '2026-10-16', group_by: 'week' });
  });

  it('владелец видит свой бизнес', async () => {
    ownerMock.mockResolvedValue({ business: { id: BUSINESS_ID } });
    const res = await GET(get(`?business_id=${BUSINESS_ID}`));
    expect(res.status).toBe(200);
    expect(ownerMock).toHaveBeenCalledWith('salon');
  });

  it('владелец не видит чужой бизнес и общий отчёт', async () => {
    ownerMock.mockResolvedValue({ business: { id: OTHER_ID } });
    expect((await GET(get(`?business_id=${BUSINESS_ID}`))).status).toBe(403);
    expect((await GET(get(''))).status).toBe(403);
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('невалидные параметры → 400 до проверки прав', async () => {
    const res = await GET(get('?group_by=year'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'invalid_params' });
    expect(superAdminMock).not.toHaveBeenCalled();
  });

  it('ошибка агрегатов → 500 без деталей, ошибка в журнале', async () => {
    superAdminMock.mockResolvedValue(true);
    loadMock.mockRejectedValue(new Error('rpc analytics_series: 57014'));
    const res = await GET(get(''));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'internal' });
    expect(logMock).toHaveBeenCalledTimes(1);
  });
});
