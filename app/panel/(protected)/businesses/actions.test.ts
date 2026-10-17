// Тесты «Бизнесы»: ручное добавление (zod, slug, гонка 23505, audit без ПД), массовая смена статуса.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '../_lib/fake-db';

const fake = createFakeDb();
const isSuperAdmin = vi.fn();
const auditOne = vi.fn(async (..._a: unknown[]) => true);
const auditMany = vi.fn(async (..._a: unknown[]) => true);

vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));
vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => isSuperAdmin() }));
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => auditOne(...a), auditMany: (...a: unknown[]) => auditMany(...a) }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(async () => true), errorMessage: (e: unknown) => String(e) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { addBusiness, massSetStatus } from './actions';

const A = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const B = '4f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function form(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  isSuperAdmin.mockResolvedValue(true);
});

describe('addBusiness', () => {
  it('ошибки zod — под полями, без запросов', async () => {
    const res = await addBusiness(null, form({ name: 'A', phone: '123', email: 'нет' }));
    expect(!res.ok && res.fieldErrors).toMatchObject({ name: expect.any(String), phone: expect.any(String), email: expect.any(String) });
    expect(fake.queries).toHaveLength(0);
  });
  it('с email — статус new, телефон нормализован, в audit нет контактов', async () => {
    fake.reply('businesses', { data: [] }, { data: { id: A } });
    const res = await addBusiness(null, form({ name: 'Барбершоп Борода', phone: '8 999 123 45 67', email: 'Owner@Mail.ru' }));
    expect(res.ok && res.data.id).toBe(A);
    const row = fake.find('businesses', 'insert')[0]?.calls.find((c) => c.method === 'insert')?.args[0];
    expect(row).toMatchObject({ status: 'new', phones: ['+79991234567'], emails: ['owner@mail.ru'], slug: 'barbershop-boroda' });
    const payload = JSON.stringify(auditOne.mock.calls[0]?.[3]);
    expect(payload).not.toContain('mail.ru');
    expect(payload).not.toContain('999');
  });
  it('без email — no_contact', async () => {
    fake.reply('businesses', { data: [] }, { data: { id: A } });
    await addBusiness(null, form({ name: 'Салон' }));
    expect(fake.find('businesses', 'insert')[0]?.calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ status: 'no_contact' });
  });
  it('занятый slug — следующий номер; гонка 23505 — повтор', async () => {
    fake.reply(
      'businesses',
      { data: [{ slug: 'salon', slug_history: ['salon-2'] }] },
      { error: { code: '23505', message: 'dup' } },
      { data: [{ slug: 'salon', slug_history: ['salon-2'] }] },
      { data: { id: A } },
    );
    const res = await addBusiness(null, form({ name: 'Салон' }));
    expect(res.ok).toBe(true);
    const slugs = fake.find('businesses', 'insert').map((q) => (q.calls.find((c) => c.method === 'insert')?.args[0] as { slug: string }).slug);
    expect(slugs).toEqual(['salon-3', 'salon-4']);
  });
});

describe('massSetStatus', () => {
  it('статус вне списка — отказ без запросов', async () => {
    const res = await massSetStatus([A], 'client');
    expect(res.ok).toBe(false);
    expect(fake.queries).toHaveLength(0);
  });
  it('клиенты и удаляемые не трогаются; отказ ставит refused_at; audit по каждому id', async () => {
    fake.reply('businesses', { data: [{ id: A }] });
    const res = await massSetStatus([A, B], 'refused');
    const q = fake.queries[0];
    const not = q?.calls.find((c) => c.method === 'not');
    expect(not?.args).toEqual(['status', 'in', '(client,transferred_out,pending_deletion,deleted)']);
    expect(q?.calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({ status: 'refused', refused_at: expect.any(String) });
    expect(res).toMatchObject({ done: [A], skipped: [B] });
    expect(auditMany).toHaveBeenCalledWith('mass_status', 'business', [A], { to: 'refused' });
  });
});
