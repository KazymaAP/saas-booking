// Тесты действий воронки: права, один условный UPDATE, отчёт о пропущенных, генерация пачкой без N+1, очередь.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { argOf, createFakeDb } from '../_lib/fake-db';

const fake = createFakeDb();
const isSuperAdmin = vi.fn();
const auditMany = vi.fn(async (..._a: unknown[]) => true);
const auditOne = vi.fn(async (..._a: unknown[]) => true);
const logErrorMock = vi.fn(async (..._a: unknown[]) => true);
const generatePrototype = vi.fn();
const queueApproved = vi.fn();

vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));
vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => isSuperAdmin() }));
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => auditOne(...a), auditMany: (...a: unknown[]) => auditMany(...a) }));
vi.mock('@/lib/log', () => ({ logError: (...a: unknown[]) => logErrorMock(...a), errorMessage: (e: unknown) => String(e) }));
vi.mock('@/lib/generate', () => ({ generatePrototype: (...a: unknown[]) => generatePrototype(...a) }));
vi.mock('@/lib/outreach', () => ({ queueApproved: (...a: unknown[]) => queueApproved(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { approveSelected, generateBatch, generationProgress, moveToInProgress, queueOutreach, sendBackForRework } from './actions';

const A = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const B = '4f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  isSuperAdmin.mockResolvedValue(true);
});

describe('массовые переходы', () => {
  it('без прав — отказ, ничего не изменено, все id в skipped (откат optimistic)', async () => {
    isSuperAdmin.mockResolvedValue(false);
    const res = await moveToInProgress([A, B]);
    expect(res.ok).toBe(false);
    expect(res.skipped).toEqual([A, B]);
    expect(fake.queries).toHaveLength(0);
  });
  it('мусор вместо id — отказ без запросов', async () => {
    expect((await moveToInProgress(['1; drop table'])).ok).toBe(false);
    expect((await moveToInProgress([])).ok).toBe(false);
    expect(fake.queries).toHaveLength(0);
  });
  it('один UPDATE с условием на текущий статус; пропущенные — в отчёте', async () => {
    fake.reply('businesses', { data: [{ id: A }] });
    const res = await moveToInProgress([A, B, A]);
    expect(fake.queries).toHaveLength(1);
    const q = fake.queries[0];
    expect(q && argOf(q, 'eq', 'status')).toBe('new');
    expect(q?.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ status: 'in_progress' });
    expect(res).toMatchObject({ ok: true, done: [A], skipped: [B] });
    expect(res.message).toMatch(/Пропущено: 1/);
    expect(auditMany).toHaveBeenCalledWith('funnel_in_progress', 'business', [A], { from: 'new', to: 'in_progress' });
  });
  it('одобрить: preview_ready → approved', async () => {
    fake.reply('businesses', { data: [{ id: A }] });
    await approveSelected([A]);
    expect(fake.queries[0] && argOf(fake.queries[0], 'eq', 'status')).toBe('preview_ready');
  });
  it('на доработку сбрасывает токен прототипа (ТЗ §3.5)', async () => {
    fake.reply('businesses', { data: [{ id: A }] });
    await sendBackForRework([A]);
    expect(fake.queries[0]?.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ status: 'in_progress', preview_token: null, preview_url: null });
  });
  it('ошибка БД — ok=false, все id в skipped, ошибка в журнале', async () => {
    fake.reply('businesses', { error: { message: 'boom' } });
    const res = await approveSelected([A, B]);
    expect(res).toMatchObject({ ok: false, done: [], skipped: [A, B] });
    expect(logErrorMock).toHaveBeenCalledWith('admin', expect.stringContaining('boom'), expect.objectContaining({ count: 2 }));
  });
});

describe('generateBatch', () => {
  it('один SELECT с join шаблона, ошибка одного не валит остальные', async () => {
    fake.reply('businesses', { data: [{ id: A, vertical_templates: null }, { id: B, vertical_templates: null }] });
    generatePrototype.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('нет шаблона'));
    const res = await generateBatch([A, B]);
    expect(fake.queries).toHaveLength(1);
    expect(String(fake.queries[0]?.calls.find((c) => c.method === 'select')?.args[0])).toContain('vertical_templates(*)');
    expect(res.done).toEqual([A]);
    expect(res.skipped).toEqual([B]);
    expect(logErrorMock).toHaveBeenCalledWith('generate', expect.stringContaining('нет шаблона'), { business: B });
  });
  it('пачка ограничена GENERATE_CHUNK', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `${i}f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f`);
    await generateBatch(ids);
    const inArg = fake.queries[0]?.calls.find((c) => c.method === 'in')?.args[1];
    expect(Array.isArray(inArg) && inArg.length).toBe(5);
  });
});

describe('generationProgress', () => {
  it('готовые — все, кто ушёл из in_progress', async () => {
    fake.reply('businesses', { data: [{ id: A, status: 'preview_ready' }, { id: B, status: 'in_progress' }] });
    const res = await generationProgress([A, B]);
    expect(res.ok && res.data).toEqual({ ready: [A], waiting: [B] });
  });
  it('пустой список — без запроса', async () => {
    await generationProgress([]);
    expect(fake.queries).toHaveLength(0);
  });
});

describe('queueOutreach', () => {
  const form = (v: string) => {
    const f = new FormData();
    f.set('template_id', v);
    return f;
  };
  it('неверный шаблон — отказ', async () => {
    expect((await queueOutreach(null, form('abc'))).ok).toBe(false);
    expect(queueApproved).not.toHaveBeenCalled();
  });
  it('ставит в очередь и пишет audit', async () => {
    queueApproved.mockResolvedValue(3);
    const res = await queueOutreach(null, form(A));
    expect(res.ok && res.data.queued).toBe(3);
    expect(queueApproved).toHaveBeenCalledWith(A);
    expect(auditOne).toHaveBeenCalledWith('funnel_queue', 'outreach', A, { queued: 3, template: A });
  });
  it('0 писем — понятная ошибка', async () => {
    queueApproved.mockResolvedValue(0);
    const res = await queueOutreach(null, form(''));
    expect(!res.ok && res.error).toMatch(/Нечего отправлять/);
  });
});
