// Тесты ручного пересчёта статистики: права, белый список периодов, audit, принудительный пересчёт кэша.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isSuperAdmin = vi.fn();
const auditOne = vi.fn(async (..._a: unknown[]) => true);
const getStats = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => isSuperAdmin() }));
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => auditOne(...a) }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(async () => true), errorMessage: (e: unknown) => String(e) }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('./compute', () => ({ PERIODS: [30, 90, 365], getStats: (...a: unknown[]) => getStats(...a) }));

import { refreshStats } from './actions';

function form(period: string): FormData {
  const f = new FormData();
  f.set('period', period);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  isSuperAdmin.mockResolvedValue(true);
  getStats.mockResolvedValue({ snapshot: { computed_at: '2026-10-16T09:30:00.000Z' } });
});

describe('refreshStats', () => {
  it('без прав — отказ, без пересчёта', async () => {
    isSuperAdmin.mockResolvedValue(false);
    expect((await refreshStats(null, form('30'))).ok).toBe(false);
    expect(getStats).not.toHaveBeenCalled();
  });
  it.each(['7', 'abc', '', '30.5'])('период «%s» вне списка — отказ', async (p) => {
    expect(await refreshStats(null, form(p))).toMatchObject({ ok: false, error: 'Неизвестный период' });
    expect(getStats).not.toHaveBeenCalled();
  });
  it('пересчёт принудительный, audit по ключу кэша, время — по Москве', async () => {
    const res = await refreshStats(null, form('90'));
    expect(getStats).toHaveBeenCalledWith(90, true);
    expect(auditOne).toHaveBeenCalledWith('stats_refresh', 'settings', 'stats_cache_90', { period: 90 });
    expect(revalidatePath).toHaveBeenCalledWith('/panel/stats');
    expect(res.ok && res.message).toBe('Пересчитано: 12:30:00');
  });
  it('сбой расчёта — общий отказ, без audit', async () => {
    getStats.mockRejectedValue(new Error('db down'));
    expect((await refreshStats(null, form('30'))).ok).toBe(false);
    expect(auditOne).not.toHaveBeenCalled();
  });
});
