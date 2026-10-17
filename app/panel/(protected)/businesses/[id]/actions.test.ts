// Тесты карточки бизнеса: заметки без ПД в audit, домен, slug с историей, статус, кнопки (идемпотентность).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { argOf, createFakeDb } from '../../_lib/fake-db';

const fake = createFakeDb();
const isSuperAdmin = vi.fn();
const auditOne = vi.fn(async (..._a: unknown[]) => true);

vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));
vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => isSuperAdmin() }));
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => auditOne(...a) }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(async () => true), errorMessage: (e: unknown) => String(e) }));
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://example.test' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { cardAction, changeSlug, changeStatus, checkSsl, saveDomain, saveNotes } from './actions';

const A = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const B = '4f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function form(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  isSuperAdmin.mockResolvedValue(true);
  delete process.env.VERCEL_API_TOKEN;
  delete process.env.VERCEL_PROJECT_ID;
  delete process.env.VERCEL_TEAM_ID;
  vi.stubGlobal('fetch', fetchMock);
});

function withVercel(team?: string): void {
  process.env.VERCEL_API_TOKEN = 'vt';
  process.env.VERCEL_PROJECT_ID = 'prj';
  if (team) process.env.VERCEL_TEAM_ID = team;
}

const http = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('saveNotes', () => {
  it('без прав — отказ', async () => {
    isSuperAdmin.mockResolvedValue(false);
    expect((await saveNotes(null, form({ id: A, notes: 'x' }))).ok).toBe(false);
    expect(fake.queries).toHaveLength(0);
  });
  it('в audit — только длина, не текст', async () => {
    const notes = 'Позвонить Ивану +79991234567';
    await saveNotes(null, form({ id: A, notes }));
    expect(auditOne).toHaveBeenCalledWith('notes_save', 'business', A, { length: notes.length });
    expect(JSON.stringify(auditOne.mock.calls[0])).not.toContain('Ивану');
  });
});

describe('saveDomain', () => {
  it('протокол и путь отрезаются; без Vercel-токена — подсказка', async () => {
    const res = await saveDomain(null, form({ id: A, domain: 'https://Client.ru/path' }));
    expect(fake.queries[0]?.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ custom_domain: 'client.ru', ssl_status: 'pending' });
    expect(res.ok && res.message).toMatch(/VERCEL_API_TOKEN/);
  });
  it('домен занят (23505) — ошибка под полем', async () => {
    fake.reply('businesses', { error: { code: '23505', message: 'dup' } });
    const res = await saveDomain(null, form({ id: A, domain: 'client.ru' }));
    expect(!res.ok && res.fieldErrors?.domain).toBeTruthy();
  });
});

describe('changeSlug', () => {
  it('занятый (в т. ч. в истории) — ошибка, без UPDATE', async () => {
    fake.reply('businesses', { data: [{ id: A, slug: 'old', slug_history: [], preview_token: null }, { id: B, slug: 'other', slug_history: ['new-one'], preview_token: null }] });
    const res = await changeSlug(null, form({ id: A, slug: 'new-one' }));
    expect(!res.ok && res.fieldErrors?.slug).toBeTruthy();
    expect(fake.find('businesses', 'update')).toHaveLength(0);
  });
  it('старый slug уходит в историю, preview_url пересобирается', async () => {
    fake.reply('businesses', { data: [{ id: A, slug: 'old', slug_history: ['older'], preview_token: 'tok' }] });
    const res = await changeSlug(null, form({ id: A, slug: 'new-one' }));
    expect(res.ok).toBe(true);
    const patch = fake.find('businesses', 'update')[0]?.calls.find((c) => c.method === 'update')?.args[0];
    expect(patch).toEqual({ slug: 'new-one', slug_history: ['older', 'old'], preview_url: 'https://example.test/preview/new-one?token=tok' });
    expect(auditOne).toHaveBeenCalledWith('slug_change', 'business', A, { from: 'old', to: 'new-one' });
  });
});

describe('changeStatus / cardAction', () => {
  it('клиента сменить нельзя — понятная ошибка, без audit', async () => {
    fake.reply('businesses', { data: [] });
    const res = await changeStatus(A, 'archived');
    expect(!res.ok && res.error).toMatch(/Клиенты/);
    expect(auditOne).not.toHaveBeenCalled();
  });
  it('одобрить — только из preview_ready', async () => {
    fake.reply('businesses', { data: [{ id: A }] });
    expect((await cardAction(A, 'approve')).ok).toBe(true);
    expect(fake.queries[0] && argOf(fake.queries[0], 'in', 'status')).toEqual(['preview_ready']);
  });
  it('удалить — pending_deletion через 30 дней', async () => {
    fake.reply('businesses', { data: [{ id: A }] });
    await cardAction(A, 'delete');
    const patch = fake.queries[0]?.calls.find((c) => c.method === 'update')?.args[0] as { status: string; deletion_scheduled_at: string };
    expect(patch.status).toBe('pending_deletion');
    const days = (new Date(patch.deletion_scheduled_at).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });
  it('отправить: без email — отказ; повторно в очередь не ставит', async () => {
    fake.reply('businesses', { data: { status: 'approved', emails: [] } });
    expect((await cardAction(A, 'send')).ok).toBe(false);
    fake.reply('businesses', { data: { status: 'approved', emails: ['a@b.ru'] } });
    fake.reply('outreach_log', { count: 1 });
    const res = await cardAction(A, 'send');
    expect(!res.ok && res.error).toMatch(/уже в очереди/);
    expect(fake.find('outreach_log', 'insert')).toHaveLength(0);
  });
});

describe('saveNotes — граничные случаи', () => {
  it('неверный id и слишком длинная заметка — без запросов', async () => {
    expect((await saveNotes(null, form({ id: 'x', notes: 'a' }))).ok).toBe(false);
    const res = await saveNotes(null, form({ id: A, notes: 'a'.repeat(5001) }));
    expect(!res.ok && res.fieldErrors?.notes).toBeTruthy();
    expect(fake.queries).toHaveLength(0);
  });
  it('ошибка БД — общий отказ, без audit', async () => {
    fake.reply('businesses', { error: { message: 'boom' } });
    const res = await saveNotes(null, form({ id: A, notes: 'x' }));
    expect(!res.ok && res.error).toMatch(/Не удалось/);
    expect(auditOne).not.toHaveBeenCalled();
  });
});

describe('saveDomain — Vercel', () => {
  it('домен регистрируется в Vercel (teamId в запросе), audit с registered=true', async () => {
    withVercel('team_1');
    fetchMock.mockResolvedValueOnce(http(200));
    const res = await saveDomain(null, form({ id: A, domain: 'client.ru' }));
    expect(res.ok && res.message).toMatch(/Проверьте SSL/);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.vercel.com/v10/projects/prj/domains?teamId=team_1');
    expect(auditOne).toHaveBeenCalledWith('domain_set', 'business', A, { domain: 'client.ru', registered: true });
  });
  it('сбой Vercel не отменяет сохранение: ошибка в журнал, registered=false', async () => {
    withVercel();
    fetchMock.mockResolvedValueOnce(http(500));
    const res = await saveDomain(null, form({ id: A, domain: 'client.ru' }));
    expect(res.ok).toBe(true);
    expect(auditOne).toHaveBeenCalledWith('domain_set', 'business', A, { domain: 'client.ru', registered: false });
  });
  it('пустой домен — отвязка без запроса в Vercel', async () => {
    withVercel();
    const res = await saveDomain(null, form({ id: A, domain: '' }));
    expect(res.ok && res.message).toBe('Домен отвязан');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.queries[0]?.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ custom_domain: null, ssl_status: 'pending' });
  });
  it('невалидный домен — ошибка под полем', async () => {
    const res = await saveDomain(null, form({ id: A, domain: 'not a domain' }));
    expect(!res.ok && res.fieldErrors?.domain).toBeTruthy();
    expect(fake.queries).toHaveLength(0);
  });
});

describe('checkSsl', () => {
  it('без домена — подсказка, без UPDATE', async () => {
    fake.reply('businesses', { data: { custom_domain: null } });
    const res = await checkSsl(null, form({ id: A }));
    expect(!res.ok && res.error).toMatch(/укажите домен/);
    expect(fake.find('businesses', 'update')).toHaveLength(0);
  });
  it('бизнеса нет — «не найден»', async () => {
    fake.reply('businesses', { data: null });
    expect(await checkSsl(null, form({ id: A }))).toMatchObject({ ok: false, error: 'Бизнес не найден' });
  });
  it('сбой чтения — не «нет домена», а общая ошибка', async () => {
    fake.reply('businesses', { error: { message: 'timeout' } });
    expect(await checkSsl(null, form({ id: A }))).toMatchObject({ ok: false, error: expect.stringMatching(/Не удалось/) });
  });
  it.each([
    [http(200, { verified: true }), 'active', /SSL активен/],
    [http(200, { verified: false }), 'pending', /ещё не выпущен/],
    [http(404), 'error', /не найден в Vercel/],
  ])('ответ Vercel → статус %#', async (reply, status, text) => {
    withVercel();
    fake.reply('businesses', { data: { custom_domain: 'client.ru' } });
    fetchMock.mockResolvedValueOnce(reply);
    const res = await checkSsl(null, form({ id: A }));
    expect(res.ok && res.message).toMatch(text);
    expect(fake.find('businesses', 'update')[0]?.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ ssl_status: status });
    expect(auditOne).toHaveBeenCalledWith('ssl_check', 'business', A, { domain: 'client.ru', status });
  });
  it('сеть недоступна — pending, не error', async () => {
    withVercel();
    fake.reply('businesses', { data: { custom_domain: 'client.ru' } });
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await checkSsl(null, form({ id: A }));
    expect(auditOne).toHaveBeenCalledWith('ssl_check', 'business', A, { domain: 'client.ru', status: 'pending' });
  });
});

describe('changeSlug — граничные случаи', () => {
  it('тот же адрес — ошибка под полем', async () => {
    fake.reply('businesses', { data: [{ id: A, slug: 'same', slug_history: [], preview_token: null }] });
    const res = await changeSlug(null, form({ id: A, slug: 'same' }));
    expect(!res.ok && res.fieldErrors?.slug).toBe('Это текущий адрес');
  });
  it('гонка 23505 на UPDATE — «адрес занят»', async () => {
    fake.reply('businesses', { data: [{ id: A, slug: 'old', slug_history: [], preview_token: null }] }, { error: { code: '23505', message: 'dup' } });
    const res = await changeSlug(null, form({ id: A, slug: 'new-one' }));
    expect(!res.ok && res.fieldErrors?.slug).toBeTruthy();
    expect(auditOne).not.toHaveBeenCalled();
  });
  it('формат slug проверяется до запроса', async () => {
    const res = await changeSlug(null, form({ id: A, slug: 'Плохой Slug' }));
    expect(!res.ok && res.fieldErrors?.slug).toBeTruthy();
    expect(fake.queries).toHaveLength(0);
  });
});

describe('cardAction — остальные кнопки', () => {
  it('архив: защищённые статусы исключены условием UPDATE', async () => {
    fake.reply('businesses', { data: [{ id: A }] });
    expect((await cardAction(A, 'archive')).ok).toBe(true);
    const not = fake.queries[0]?.calls.find((c) => c.method === 'not');
    expect(not?.args).toEqual(['status', 'in', '(client,transferred_out,deleted,archived,pending_deletion)']);
    expect(auditOne).toHaveBeenCalledWith('card_archive', 'business', A, { to: 'archived' });
  });
  it('повторное удаление — понятный отказ, без audit', async () => {
    fake.reply('businesses', { data: [] });
    expect(await cardAction(A, 'delete')).toMatchObject({ ok: false, error: 'Этот бизнес нельзя удалить' });
    expect(auditOne).not.toHaveBeenCalled();
  });
  it('отправить: одна запись в очередь с токеном, audit без адреса', async () => {
    fake.reply('businesses', { data: { status: 'approved', emails: ['owner@mail.ru'] } });
    fake.reply('outreach_log', { count: 0 }, { data: null });
    const res = await cardAction(A, 'send');
    expect(res.ok).toBe(true);
    const row = fake.find('outreach_log', 'insert')[0]?.calls.find((c) => c.method === 'insert')?.args[0] as Record<string, string>;
    expect(row).toMatchObject({ business_id: A, channel: 'email', status: 'queued' });
    expect(row.tracking_token).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(auditOne.mock.calls)).not.toContain('mail.ru');
  });
  it('отправить: сбой подсчёта очереди — не шлём повторно', async () => {
    fake.reply('businesses', { data: { status: 'approved', emails: ['a@b.ru'] } });
    fake.reply('outreach_log', { error: { message: 'timeout' } });
    expect((await cardAction(A, 'send')).ok).toBe(false);
    expect(fake.find('outreach_log', 'insert')).toHaveLength(0);
  });
  it('отправить: не одобрен — отказ', async () => {
    fake.reply('businesses', { data: { status: 'preview_ready', emails: ['a@b.ru'] } });
    expect(await cardAction(A, 'send')).toMatchObject({ ok: false, error: expect.stringMatching(/одобренный/) });
  });
  it('неверный id и без прав — без запросов', async () => {
    expect((await cardAction('nope', 'approve')).ok).toBe(false);
    isSuperAdmin.mockResolvedValue(false);
    expect((await changeStatus(A, 'archived')).ok).toBe(false);
    expect(fake.queries).toHaveLength(0);
  });
  it('смена статуса на «отказ» ставит refused_at', async () => {
    fake.reply('businesses', { data: [{ id: A }] });
    expect((await changeStatus(A, 'refused')).ok).toBe(true);
    expect(fake.queries[0]?.calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({ status: 'refused', refused_at: expect.any(String) });
  });
});
