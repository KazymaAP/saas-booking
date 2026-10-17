// Тесты server actions «Ниши»: права, ошибки JSON под полем, уникальность, импорт одним upsert.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '../_lib/fake-db';

const fake = createFakeDb();
const isSuperAdmin = vi.fn();
const auditMock = vi.fn();

vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));
vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => isSuperAdmin() }));
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(async () => true), errorMessage: (e: unknown) => String(e) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { importVerticals, saveVertical, setVerticalActive } from './actions';

const ID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function form(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}
const valid = { name: 'Барбершоп', slug: 'barber', url_prefix: 'b', is_active: '1', default_services: '[{"name":"Стрижка","price":1500,"duration":60}]' };

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  isSuperAdmin.mockResolvedValue(true);
});

describe('saveVertical', () => {
  it('без прав — отказ без запросов', async () => {
    isSuperAdmin.mockResolvedValue(false);
    expect((await saveVertical(null, form(valid))).ok).toBe(false);
    expect(fake.queries).toHaveLength(0);
  });
  it('битый JSON — ошибка под своим полем, в БД ничего', async () => {
    const res = await saveVertical(null, form({ ...valid, default_texts: '{"a":' }));
    expect(!res.ok && res.fieldErrors?.default_texts).toMatch(/JSON/);
    expect(fake.queries).toHaveLength(0);
  });
  it('неверная структура — путь внутри JSON', async () => {
    const res = await saveVertical(null, form({ ...valid, default_services: '[{"name":"A","price":"дорого","duration":60}]' }));
    expect(!res.ok && res.fieldErrors?.default_services).toMatch(/^\[0\]\.price/);
  });
  it('создание: insert + audit с id новой ниши', async () => {
    fake.reply('vertical_templates', { data: [{ id: ID }] });
    const res = await saveVertical(null, form(valid));
    expect(res.ok && res.data.id).toBe(ID);
    expect(fake.find('vertical_templates', 'insert')).toHaveLength(1);
    expect(auditMock).toHaveBeenCalledWith('vertical_create', 'vertical', ID, expect.objectContaining({ slug: 'barber', services: 1 }));
  });
  it('занятый префикс (23505) — ошибка под url_prefix', async () => {
    fake.reply('vertical_templates', { error: { code: '23505', message: 'duplicate key value violates unique constraint "vertical_templates_url_prefix_key"' } });
    const res = await saveVertical(null, form({ ...valid, id: ID }));
    expect(!res.ok && res.fieldErrors?.url_prefix).toBeTruthy();
  });
});

describe('setVerticalActive', () => {
  it('переключает и пишет audit', async () => {
    fake.reply('vertical_templates', { data: [{ id: ID }] });
    expect((await setVerticalActive(ID, false)).ok).toBe(true);
    expect(auditMock).toHaveBeenCalledWith('vertical_toggle', 'vertical', ID, { active: false });
  });
});

describe('importVerticals', () => {
  it('один SELECT + один upsert, конфликт префикса с другой нишей отклоняется', async () => {
    fake.reply('vertical_templates', { data: [{ slug: 'barber', url_prefix: 'b' }, { slug: 'tire', url_prefix: 't' }] }, { error: null });
    const json = JSON.stringify([
      { name: 'Барбер', slug: 'barber', url_prefix: 'b' },
      { name: 'Мойка', slug: 'wash', url_prefix: 'w' },
      { name: 'Чужой', slug: 'alien', url_prefix: 't' },
    ]);
    const res = await importVerticals(null, form({ json }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ created: 1, updated: 1 });
    expect(res.data.errors[0]).toContain('alien');
    const upserts = fake.find('vertical_templates', 'upsert');
    expect(upserts).toHaveLength(1);
    const rows = upserts[0]?.calls.find((c) => c.method === 'upsert')?.args[0] as { slug: string }[];
    expect(rows.map((r) => r.slug)).toEqual(['barber', 'wash']);
  });
  it('пустой/битый файл — ошибка под полем json', async () => {
    const res = await importVerticals(null, form({ json: 'не json' }));
    expect(!res.ok && res.fieldErrors?.json).toBeTruthy();
  });
});
