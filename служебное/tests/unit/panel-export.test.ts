// tests/unit/panel-export.test.ts — GET /panel/export (CSV броней): права, постраничное чтение, заголовки ответа.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser, Business } from '@/lib/database.types';
import { calls, queueResult, resetDb } from './supabase-mock';
import { SLUG, makeBusiness, makeMember } from './panel-fixtures';

type Access = { business: Business; member: AdminUser } | null;
const session = vi.hoisted(() => ({ current: null as Access }));
const audit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', async () => {
  const { db } = await import('./supabase-mock');
  return { adminClient: () => db };
});
vi.mock('@/lib/owner-session', () => ({ currentOwner: async () => session.current }));
vi.mock('@/lib/audit', () => ({ audit }));

const { GET } = await import('../../../app/[prefix]/[slug]/panel/export/route');
const params = { params: { prefix: 's', slug: SLUG } };
const req = new Request('http://localhost/s/studio-test/panel/export');

const booking = (i: number) => ({
  scheduled_at: '2026-10-20T07:00:00Z', status: 'done', client_name: `Клиент ${i}`, client_phone: '+79990000000',
  client_email: null, comment: null, created_at: '2026-10-01T07:00:00Z', services: { name: 'Маникюр', price: 1500 },
});

beforeEach(() => {
  resetDb();
  audit.mockReset().mockResolvedValue(undefined);
  session.current = { business: makeBusiness(), member: makeMember('owner') };
});

describe('export/route', () => {
  it('без сессии — 401, в БД не ходим', async () => {
    session.current = null;
    const res = await GET(req, params);
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('manager — 403 (в файле ПД клиентов)', async () => {
    session.current = { business: makeBusiness(), member: makeMember('manager') };
    expect((await GET(req, params)).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('читает страницами по 1000, пока страница полная', async () => {
    queueResult('bookings', { data: Array.from({ length: 1000 }, (_, i) => booking(i)) }, { data: [booking(1000), booking(1001)] });
    const res = await GET(req, params);
    expect(res.status).toBe(200);
    const ranges = calls.filter((c) => c.table === 'bookings').map((c) => c.ops.find((o) => o.method === 'range')?.args);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    const text = await res.text();
    // BOM + заголовок + 1002 строки данных.
    expect(text.trimEnd().split('\r\n')).toHaveLength(1003);
    expect(audit).toHaveBeenCalledWith('bookings_export', 'business', expect.any(String), { rows: 1002 });
  });

  it('заголовки: CSV-вложение, без кэша, nosniff', async () => {
    queueResult('bookings', { data: [booking(1)] });
    const res = await GET(req, params);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename=".+\.csv"$/);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('ошибка БД — 500 с текстом, а не пустой файл', async () => {
    queueResult('bookings', { error: { message: 'down' } });
    const res = await GET(req, params);
    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(audit).not.toHaveBeenCalled();
  });

  it('сбой журнала не ломает выгрузку', async () => {
    audit.mockRejectedValue(new Error('audit down'));
    queueResult('bookings', { data: [] });
    expect((await GET(req, params)).status).toBe(200);
  });
});
