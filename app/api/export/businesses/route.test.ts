// Тесты экспорта бизнесов: права, фильтры как у списка, постраничное чтение, стриминг CSV, audit без ПД.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { argOf, createFakeDb } from '@/главная/lib/fake-db';

const fake = createFakeDb();
const isSuperAdmin = vi.fn();
const auditMock = vi.fn(async (..._a: unknown[]) => true);
const logErrorMock = vi.fn(async () => true);
vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));
vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => isSuperAdmin() }));
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
vi.mock('@/lib/log', () => ({ logError: (...a: unknown[]) => logErrorMock(...(a as [])), errorMessage: (e: unknown) => String(e) }));

import { GET } from './route';

const VID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const row = (i: number) => ({ id: `id-${i}`, name: `Бизнес ${i}`, status: 'new', emails: ['x@y.ru'] });
const req = (qs: string) => new Request(`http://localhost/api/export/businesses?${qs}`);

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  isSuperAdmin.mockResolvedValue(true);
});

describe('GET /api/export/businesses', () => {
  it('без прав — 403, запросов нет', async () => {
    isSuperAdmin.mockResolvedValue(false);
    const res = await GET(req('format=csv'));
    expect(res.status).toBe(403);
    expect(fake.queries).toHaveLength(0);
  });

  it('CSV: фильтры списка применяются, страница списка игнорируется', async () => {
    fake.reply('businesses', { data: [row(1)] });
    const res = await GET(req(`status=new&city=Казань&vertical=${VID}&q=барбер&page=7`));
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    const q = fake.queries[0];
    expect(q && argOf(q, 'eq', 'status')).toBe('new');
    expect(q && argOf(q, 'ilike', 'city')).toBe('Казань');
    expect(q && argOf(q, 'eq', 'vertical_template_id')).toBe(VID);
    expect(q && argOf(q, 'ilike', 'name')).toBe('%барбер%');
    expect(q?.calls.find((c) => c.method === 'range')?.args).toEqual([0, 999]);
    // BOM EF BB BF — Excel открывает кириллицу без «кракозябр».
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain('Бизнес 1');
    expect(res.headers.get('Content-Disposition')).toMatch(/businesses-new-\d{4}-\d{2}-\d{2}\.csv/);
  });

  it('CSV читается страницами по 1000 до неполной', async () => {
    fake.reply('businesses', { data: Array.from({ length: 1000 }, (_, i) => row(i)) }, { data: [row(1000)] });
    const text = await (await GET(req('format=csv'))).text();
    expect(fake.queries).toHaveLength(2);
    expect(fake.queries[1]?.calls.find((c) => c.method === 'range')?.args).toEqual([1000, 1999]);
    expect(text.trim().split('\n')).toHaveLength(1 + 1001);
    expect(auditMock).toHaveBeenCalledWith('export_businesses', 'business', null, expect.objectContaining({ format: 'csv', rows: 1001 }));
  });

  it('audit без ПД: поиск — только длина', async () => {
    await (await GET(req('q=Иванов'))).text();
    const payload = auditMock.mock.calls[0]?.[3];
    expect(JSON.stringify(payload)).not.toContain('Иванов');
  });

  it('без статуса — удалённые скрыты', async () => {
    await (await GET(req(''))).text();
    expect(fake.queries[0] && argOf(fake.queries[0], 'neq', 'status')).toBe('deleted');
  });

  it('XLSX: файл с zip-сигнатурой и типом', async () => {
    fake.reply('businesses', { data: [row(1)] });
    const res = await GET(req('format=xlsx'));
    expect(res.headers.get('Content-Type')).toMatch(/spreadsheetml/);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect([buf[0], buf[1]]).toEqual([0x50, 0x4b]);
  });

  it('XLSX: ошибка БД — 500 и запись в журнал', async () => {
    fake.reply('businesses', { error: { message: 'boom' } });
    const res = await GET(req('format=xlsx'));
    expect(res.status).toBe(500);
    expect(logErrorMock).toHaveBeenCalled();
  });

  it('CSV: ошибка БД посреди выгрузки — поток обрывается, ошибка в журнале', async () => {
    fake.reply('businesses', { error: { message: 'boom' } });
    const res = await GET(req('format=csv'));
    await expect(res.text()).rejects.toThrow();
    expect(logErrorMock).toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('больше MAX_ROWS — выгрузка обрезается, truncated в audit и заголовке XLSX', async () => {
    const full = { data: Array.from({ length: 1000 }, (_, i) => row(i)) };
    fake.reply('businesses', ...Array.from({ length: 50 }, () => full));
    const res = await GET(req('format=xlsx'));
    expect(fake.queries).toHaveLength(50);
    expect(res.headers.get('X-Export-Truncated')).toBe('50000');
    expect(auditMock).toHaveBeenCalledWith('export_businesses', 'business', null, expect.objectContaining({ rows: 50_000, truncated: true }));
  });

  it('неполная последняя страница — не обрезано', async () => {
    fake.reply('businesses', { data: [row(1)] });
    const res = await GET(req('format=xlsx'));
    expect(res.headers.get('X-Export-Truncated')).toBeNull();
    expect(auditMock).toHaveBeenCalledWith('export_businesses', 'business', null, expect.objectContaining({ truncated: false }));
  });
});
