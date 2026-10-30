// Тесты server actions «Клиенты»: права, валидация, условные UPDATE, audit без ПД, пароль не в cookie.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, argOf } from '../_lib/fake-db';

const createUser = vi.fn();
const deleteUser = vi.fn();
const fake = createFakeDb({ createUser, deleteUser });
const isSuperAdmin = vi.fn();
const sendMail = vi.fn();
const auditMock = vi.fn();

vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));
vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => isSuperAdmin() }));
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => auditMock(...a), auditMany: vi.fn() }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(async () => true), errorMessage: (e: unknown) => String(e) }));
vi.mock('@/lib/notify', () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));
vi.mock('@/lib/admin-notify', () => ({ notifyAdmin: vi.fn(async () => true) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { clientAction, createOwnerAccess } from './actions';

const ID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function form(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  isSuperAdmin.mockResolvedValue(true);
  sendMail.mockResolvedValue(true);
});

describe('clientAction — права и вход', () => {
  it('без супер-админа ничего не пишет в БД', async () => {
    isSuperAdmin.mockResolvedValue(false);
    const res = await clientAction(ID, 'paid');
    expect(res.ok).toBe(false);
    expect(fake.queries).toHaveLength(0);
  });
  it('неизвестное действие и кривой id отклоняются', async () => {
    expect((await clientAction(ID, 'drop_table')).ok).toBe(false);
    expect((await clientAction('1; drop', 'paid')).ok).toBe(false);
    expect(fake.find('businesses', 'update')).toHaveLength(0);
  });
});

describe('clientAction — операции', () => {
  it('оплата: один условный UPDATE, цена из настроек, audit без ПД', async () => {
    fake.reply('settings', { data: { value: { initial: 6000, monthly: 1200 } } });
    fake.reply('businesses', { data: [{ id: ID }] });
    const res = await clientAction(ID, 'paid');
    expect(res.ok).toBe(true);
    const [upd] = fake.find('businesses', 'update');
    expect(upd).toBeDefined();
    if (!upd) return;
    expect(upd.calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({ status: 'client', subscription_price: 1200 });
    expect(argOf(upd, 'not', 'status')).toBe('in');
    expect(auditMock).toHaveBeenCalledWith('mark_paid', 'business', ID, expect.objectContaining({ amount: 6000 }));
  });
  it('повторная оплата (UPDATE не вернул строк) — ошибка, audit не пишется', async () => {
    fake.reply('businesses', { data: [] });
    const res = await clientAction(ID, 'paid');
    expect(res.ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
  it('оплата с выбранным тарифом «pro» записывает plan_type и цену тарифа', async () => {
    fake.reply('settings', { data: { value: { initial: 6000, monthly: 1200 } } }, { data: { value: { basic: { name: 'Базовый', price: 1000 }, pro: { name: 'Премиум', price: 2500 } } } });
    fake.reply('businesses', { data: [{ id: ID }] });
    const res = await clientAction(ID, 'paid', 'pro');
    expect(res.ok).toBe(true);
    const [upd] = fake.find('businesses', 'update');
    expect(upd).toBeDefined();
    if (!upd) return;
    expect(upd.calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({ plan_type: 'pro', subscription_price: 2500 });
    expect(auditMock).toHaveBeenCalledWith('mark_paid', 'business', ID, expect.objectContaining({ amount: 6000, monthly: 2500, plan: 'pro' }));
  });
  it('оплата с неизвестным тарифом — берёт первый доступный (basic)', async () => {
    fake.reply('settings', { data: { value: { initial: 6000, monthly: 1200 } } }, { data: { value: { basic: { name: 'Базовый', price: 1000 }, pro: { name: 'Премиум', price: 2500 } } } });
    fake.reply('businesses', { data: [{ id: ID }] });
    const res = await clientAction(ID, 'paid', 'unknown');
    expect(res.ok).toBe(true);
    const [upd] = fake.find('businesses', 'update');
    if (!upd) return;
    expect(upd.calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({ plan_type: 'basic', subscription_price: 1000 });
  });
  it('продление защищено от двойного клика условием на текущую дату', async () => {
    fake.reply('businesses', { data: { subscription_until: '2099-01-01', status: 'client' } }, { data: [{ id: ID }] });
    const res = await clientAction(ID, 'extend');
    expect(res.ok && res.data.subscription_until).toBe('2099-01-31');
    const upd = fake.find('businesses', 'update')[0];
    expect(upd && argOf(upd, 'eq', 'subscription_until')).toBe('2099-01-01');
  });
  it('напоминание: адрес не попадает в журнал', async () => {
    fake.reply('businesses', { data: { name: 'Колесо', emails: ['owner@mail.ru'], subscription_until: '2026-10-20', status: 'client' } });
    const res = await clientAction(ID, 'remind');
    expect(res.ok).toBe(true);
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain('owner@mail.ru');
  });
  it('напоминание без ящика — честная ошибка вместо «успеха»', async () => {
    fake.reply('businesses', { data: { name: 'Колесо', emails: ['owner@mail.ru'], subscription_until: null, status: 'client' } });
    sendMail.mockResolvedValue(false);
    expect((await clientAction(ID, 'remind')).ok).toBe(false);
  });
  it('отказ пишется в audit (раньше не писался)', async () => {
    fake.reply('businesses', { data: [{ id: ID }] });
    await clientAction(ID, 'refuse');
    expect(auditMock).toHaveBeenCalledWith('mark_refused', 'business', ID, { to: 'refused' });
  });
});

describe('createOwnerAccess', () => {
  it('ошибка zod — под полем email, учётка не создаётся', async () => {
    const res = await createOwnerAccess(null, form({ id: ID, email: 'плохой' }));
    expect(!res.ok && res.fieldErrors?.email).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });
  it('пароль возвращается в ответе и уходит письмом; в audit нет email и пароля', async () => {
    fake.reply('businesses', { data: { status: 'client', slug: 'koleso', custom_domain: null, vertical_templates: { url_prefix: 't' } } });
    createUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const res = await createOwnerAccess(null, form({ id: ID, email: 'Owner@Mail.ru' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.email).toBe('owner@mail.ru');
    expect(res.data.password.length).toBeGreaterThanOrEqual(16);
    const mail = sendMail.mock.calls[0]?.[0] as { to: string; text: string };
    expect(mail.to).toBe('owner@mail.ru');
    expect(mail.text).toContain('/t/koleso/panel/login');
    const logged = JSON.stringify(auditMock.mock.calls);
    expect(logged).not.toContain('owner@mail.ru');
    expect(logged).not.toContain(res.data.password);
  });
  it('не клиент — доступ не создаётся', async () => {
    fake.reply('businesses', { data: { status: 'sent', slug: 'x', custom_domain: null, vertical_templates: null } });
    expect((await createOwnerAccess(null, form({ id: ID, email: 'a@b.ru' }))).ok).toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });
  it('сбой привязки admin_users — учётка удаляется (можно повторить)', async () => {
    fake.reply('businesses', { data: { status: 'client', slug: 'x', custom_domain: 'x.ru', vertical_templates: null } });
    fake.reply('admin_users', { error: { message: 'fk' } });
    createUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    deleteUser.mockResolvedValue({});
    expect((await createOwnerAccess(null, form({ id: ID, email: 'a@b.ru' }))).ok).toBe(false);
    expect(deleteUser).toHaveBeenCalledWith('u2');
  });
});

describe('clientAction — остальные операции и сбои', () => {
  it('сбой чтения цен — оплата не проходит по ценам «по умолчанию»', async () => {
    fake.reply('settings', { error: { message: 'timeout' } });
    expect((await clientAction(ID, 'paid')).ok).toBe(false);
    expect(fake.find('businesses', 'update')).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });
  it('нет настроек цен — значения ТЗ §14.2 (5000 + 1000)', async () => {
    fake.reply('settings', { data: null });
    fake.reply('businesses', { data: [{ id: ID }] });
    await clientAction(ID, 'paid');
    expect(auditMock).toHaveBeenCalledWith('mark_paid', 'business', ID, expect.objectContaining({ amount: 5000, monthly: 1000 }));
  });
  it('отключение — только активной подписки клиента', async () => {
    fake.reply('businesses', { data: [{ id: ID }] });
    expect((await clientAction(ID, 'disable')).ok).toBe(true);
    const upd = fake.find('businesses', 'update')[0];
    expect(upd && argOf(upd, 'eq', 'subscription_active')).toBe(true);
    expect(upd && argOf(upd, 'eq', 'status')).toBe('client');
    fake.reply('businesses', { data: [] });
    expect(await clientAction(ID, 'disable')).toMatchObject({ ok: false, error: 'Подписка уже отключена' });
  });
  it('передача кода — один раз (code_transferred_at is null)', async () => {
    fake.reply('businesses', { data: [{ id: ID }] });
    const res = await clientAction(ID, 'transfer');
    expect(res.ok).toBe(true);
    const upd = fake.find('businesses', 'update')[0];
    expect(upd?.calls.some((c) => c.method === 'is' && c.args[0] === 'code_transferred_at' && c.args[1] === null)).toBe(true);
    expect(auditMock).toHaveBeenCalledWith('transfer_mark', 'business', ID, expect.objectContaining({ support_until: expect.any(String) }));
  });
  it('продление не клиента — отказ без UPDATE', async () => {
    fake.reply('businesses', { data: { subscription_until: null, status: 'sent' } });
    expect((await clientAction(ID, 'extend')).ok).toBe(false);
    expect(fake.find('businesses', 'update')).toHaveLength(0);
  });
  it('продление: параллельное изменение — «обновите страницу»', async () => {
    fake.reply('businesses', { data: { subscription_until: '2099-01-01', status: 'client' } }, { data: [] });
    expect(await clientAction(ID, 'extend')).toMatchObject({ ok: false, error: expect.stringMatching(/Обновите страницу/) });
  });
  it('напоминание: нет email — отказ без отправки; SMTP бросил — ошибка в журнал', async () => {
    fake.reply('businesses', { data: { name: 'К', emails: [], subscription_until: null, status: 'client' } });
    expect(await clientAction(ID, 'remind')).toMatchObject({ ok: false, error: 'У бизнеса нет email' });
    expect(sendMail).not.toHaveBeenCalled();
    fake.reply('businesses', { data: { name: 'К', emails: ['a@b.ru'], subscription_until: null, status: 'client' } });
    sendMail.mockRejectedValue(new Error('SMTP 535'));
    expect((await clientAction(ID, 'remind')).ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe('createOwnerAccess — сбои', () => {
  it('email уже зарегистрирован — ошибка под полем', async () => {
    fake.reply('businesses', { data: { status: 'client', slug: 'x', custom_domain: null, vertical_templates: null } });
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'already registered' } });
    const res = await createOwnerAccess(null, form({ id: ID, email: 'a@b.ru' }));
    expect(!res.ok && res.fieldErrors?.email).toBeTruthy();
  });
  it('письмо не ушло — доступ создан, пароль показан, mailed=false в audit', async () => {
    fake.reply('businesses', { data: { status: 'client', slug: 'x', custom_domain: 'client.ru', vertical_templates: null } });
    createUser.mockResolvedValue({ data: { user: { id: 'u3' } }, error: null });
    sendMail.mockResolvedValue(false);
    const res = await createOwnerAccess(null, form({ id: ID, email: 'a@b.ru' }));
    expect(res.ok && res.data.mailed).toBe(false);
    expect(res.ok && res.message).toMatch(/передайте пароль вручную/);
    expect(auditMock).toHaveBeenCalledWith('create_access', 'business', ID, { role: 'owner', mailed: false });
  });
  it('сбой чтения бизнеса — учётка не создаётся', async () => {
    fake.reply('businesses', { error: { message: 'timeout' } });
    expect((await createOwnerAccess(null, form({ id: ID, email: 'a@b.ru' }))).ok).toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });
});
