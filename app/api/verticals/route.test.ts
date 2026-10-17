// Тесты выгрузки ниш: права, набор колонок = схема импорта, ошибки БД.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/app/panel/(protected)/_lib/fake-db';

const fake = createFakeDb();
const isSuperAdmin = vi.fn();
const logErrorMock = vi.fn(async () => true);
vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));
vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => isSuperAdmin() }));
vi.mock('@/lib/log', () => ({ logError: (...a: unknown[]) => logErrorMock(...(a as [])), errorMessage: (e: unknown) => String(e) }));

import { GET } from './route';
import { validateImport } from '@/app/panel/(protected)/verticals/schema';

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  isSuperAdmin.mockResolvedValue(true);
});

describe('GET /api/verticals', () => {
  it('без прав — 401 без запросов к БД', async () => {
    isSuperAdmin.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(fake.queries).toHaveLength(0);
  });
  it('выгружает только поля схемы: файл принимается импортом без правок', async () => {
    const v = { name: 'Барбершоп', slug: 'barber', url_prefix: 'b', icon: null, description: null, fields: [], default_services: [{ name: 'Стрижка', price: 1500, duration: 60 }], default_texts: {}, default_colors: {}, blocks: {}, show_demo_mode: true, is_active: true };
    fake.reply('vertical_templates', { data: [v] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="verticals-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const select = String(fake.queries[0]?.calls.find((c) => c.method === 'select')?.args[0]);
    expect(select).not.toMatch(/\bid\b|created_at/);
    const body: unknown = await res.json();
    expect(validateImport(body).errors).toEqual([]);
  });
  it('ошибка БД — 500 и запись в журнал', async () => {
    fake.reply('vertical_templates', { error: { message: 'boom' } });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(logErrorMock).toHaveBeenCalled();
  });
});
