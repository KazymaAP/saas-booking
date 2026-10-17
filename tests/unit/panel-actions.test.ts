// tests/unit/panel-actions.test.ts — server actions кабинета с моком Supabase (Vitest).
// Проверяем главное: роль, валидацию, условия WHERE (права/гонки), откат при ошибках и формат ActionResult.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser, Business } from '@/lib/database.types';
import { argOf, authAdmin, hasOp, opsOf, queueResult, resetDb, storageApi } from './supabase-mock';
import { BUSINESS_ID, OTHER_ID, ROW_ID, SLUG, makeBusiness, makeMember } from './panel-fixtures';

type Access = { business: Business; member: AdminUser } | null;
const session = vi.hoisted(() => ({ current: null as Access }));
const sendMail = vi.hoisted(() => vi.fn());
const notifyAdmin = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', async () => {
  const { db } = await import('./supabase-mock');
  return { adminClient: () => db };
});
vi.mock('@/lib/owner-session', () => ({ currentOwner: async () => session.current }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/notify', () => ({ sendMail }));
vi.mock('@/lib/admin-notify', () => ({ notifyAdmin }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(async () => undefined) }));
vi.mock('@/lib/rate-limit', () => ({ hitRateLimit: rateLimit }));

const P = '../../app/[prefix]/[slug]/panel/(protected)';
const bookings = await import(`${P}/bookings/actions`);
const services = await import(`${P}/services/actions`);
const settings = await import(`${P}/settings/actions`);
const texts = await import(`${P}/texts/actions`);
const photos = await import(`${P}/photos/actions`);
const team = await import(`${P}/team/actions`);
const data = await import(`${P}/data/actions`);
const subscription = await import(`${P}/subscription/actions`);

function loginAs(role: AdminUser['role'] | null, patch: Partial<Business> = {}): void {
  session.current = role ? { business: makeBusiness(patch), member: makeMember(role) } : null;
}

beforeEach(() => {
  resetDb();
  sendMail.mockReset().mockResolvedValue(true);
  notifyAdmin.mockReset().mockResolvedValue(true);
  rateLimit.mockReset().mockResolvedValue(true);
  loginAs('owner');
});

describe('bookings.changeBookingStatus', () => {
  const booking = { id: ROW_ID, status: 'confirmed', scheduled_at: '2026-10-20T07:00:00Z', client_email: 'c@test.ru', client_name: 'Анна' };

  it('без сессии — forbidden, в БД не ходим', async () => {
    loginAs(null);
    const r = await bookings.changeBookingStatus(SLUG, { id: ROW_ID, action: 'confirm' });
    expect(r.ok).toBe(false);
    expect(opsOf('bookings')).toEqual([]);
  });

  it('manager может подтверждать брони', async () => {
    loginAs('manager');
    queueResult('bookings', { data: [booking] });
    expect((await bookings.changeBookingStatus(SLUG, { id: ROW_ID, action: 'confirm' })).ok).toBe(true);
  });

  it('confirm: условный UPDATE (business_id + текущий статус) и письмо клиенту', async () => {
    queueResult('bookings', { data: [booking] });
    const r = await bookings.changeBookingStatus(SLUG, { id: ROW_ID, action: 'confirm' });
    expect(r).toMatchObject({ ok: true, data: { status: 'confirmed' } });
    expect(hasOp('bookings', 'eq', 'business_id', BUSINESS_ID)).toBe(true);
    expect(hasOp('bookings', 'in', 'status', ['new'])).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({ to: 'c@test.ru' });
  });

  it('гонка: строка уже не в статусе new → ошибка, второго письма нет', async () => {
    queueResult('bookings', { data: [] });
    const r = await bookings.changeBookingStatus(SLUG, { id: ROW_ID, action: 'confirm' });
    expect(r.ok).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('cancel пишет cancelled_by=business; письмо не отправляется', async () => {
    queueResult('bookings', { data: [{ ...booking, status: 'cancelled' }] });
    await bookings.changeBookingStatus(SLUG, { id: ROW_ID, action: 'cancel' });
    expect(argOf('bookings', 'update')).toMatchObject({ status: 'cancelled', cancelled_by: 'business' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('неверный id или действие — invalid без запроса', async () => {
    expect((await bookings.changeBookingStatus(SLUG, { id: 'x', action: 'confirm' })).ok).toBe(false);
    expect((await bookings.changeBookingStatus(SLUG, { id: ROW_ID, action: 'drop' as 'confirm' })).ok).toBe(false);
    expect(opsOf('bookings')).toEqual([]);
  });

  it('ошибка БД → server error', async () => {
    queueResult('bookings', { error: { message: 'down' } });
    expect(await bookings.changeBookingStatus(SLUG, { id: ROW_ID, action: 'done' })).toMatchObject({ ok: false });
  });
});

describe('services', () => {
  const values = { name: 'Маникюр', price: '1500', duration_minutes: '60', description: '' };
  const row = { id: ROW_ID, name: 'Маникюр', description: null, price: 1500, duration_minutes: 60, is_active: true };

  it('manager не может менять услуги', async () => {
    loginAs('manager');
    expect(await services.addService(SLUG, values)).toMatchObject({ ok: false });
    expect(await services.setServiceActive(SLUG, ROW_ID, false)).toMatchObject({ ok: false });
  });

  it('addService: zod-ошибки по полям', async () => {
    const r = await services.addService(SLUG, { ...values, name: 'М', price: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors ?? {})).toEqual(expect.arrayContaining(['name', 'price']));
  });

  it('addService: строки → числа, пустое описание → null', async () => {
    queueResult('services', { data: [row] });
    const r = await services.addService(SLUG, values);
    expect(r).toMatchObject({ ok: true, data: row });
    expect(argOf('services', 'insert')).toEqual({ name: 'Маникюр', price: 1500, duration_minutes: 60, description: null, business_id: BUSINESS_ID, sort_order: 999, is_active: true });
  });

  it('updateService: чужая услуга → notFound', async () => {
    queueResult('services', { data: [] });
    expect(await services.updateService(SLUG, ROW_ID, values)).toMatchObject({ ok: false });
    expect(hasOp('services', 'eq', 'business_id', BUSINESS_ID)).toBe(true);
  });

  it('setServiceActive: мягкое удаление is_active=false', async () => {
    queueResult('services', { data: [{ id: ROW_ID }] });
    expect(await services.setServiceActive(SLUG, ROW_ID, false)).toMatchObject({ ok: true });
    expect(hasOp('services', 'update', { is_active: false })).toBe(true);
  });
});

describe('settings.saveSettings', () => {
  const hours = { mon: '09:00-18:00', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' };
  const form = {
    name: 'Студия', description: '', city: 'Москва', address: 'ул. Ленина, 1', phones: '8 999 123-45-67', emails: 'A@Test.ru',
    brand_color: '#AA00CC', hours, slot_step_minutes: '60', cancel_hours_before: '2', min_hours_before: '1', max_days_ahead: '30', auto_confirm: true,
  };

  it('только owner', async () => {
    loginAs('manager');
    expect(await settings.saveSettings(SLUG, form)).toMatchObject({ ok: false });
    expect(opsOf('businesses')).toEqual([]);
  });

  it('нормализует телефоны, email, цвет и сохраняет auto_confirm', async () => {
    queueResult('businesses', {});
    expect(await settings.saveSettings(SLUG, form)).toMatchObject({ ok: true });
    expect(argOf('businesses', 'update')).toEqual({
      name: 'Студия', description: null, city: 'Москва', address: 'ул. Ленина, 1', phones: ['+79991234567'], emails: ['a@test.ru'],
      brand_color: '#aa00cc', working_hours: { mon: [{ open: '09:00', close: '18:00' }], tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
      slot_step_minutes: 60, cancel_hours_before: 2, min_hours_before: 1, max_days_ahead: 30, auto_confirm: true,
    });
  });

  it('ошибка часов — под полем дня', async () => {
    const r = await settings.saveSettings(SLUG, { ...form, hours: { ...hours, tue: '18:00-09:00' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.['hours.tue']).toBeTruthy();
  });

  it('min_hours_before больше горизонта — ошибка', async () => {
    const r = await settings.saveSettings(SLUG, { ...form, min_hours_before: '72', max_days_ahead: '1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.min_hours_before).toBeTruthy();
  });
});

describe('texts.saveTexts', () => {
  it('сохраняет чужие ключи custom_texts и удаляет пустые', async () => {
    loginAs('owner', { custom_texts: { booking_title: 'Онлайн-запись', about: 'старый' } });
    queueResult('businesses', {});
    await texts.saveTexts(SLUG, { hero_title: 'Привет', hero_subtitle: '', about: '', cta: '' });
    expect(argOf('businesses', 'update')).toEqual({ custom_texts: { booking_title: 'Онлайн-запись', hero_title: 'Привет' } });
  });

  it('manager — только просмотр', async () => {
    loginAs('manager');
    expect(await texts.saveTexts(SLUG, { hero_title: 'x', hero_subtitle: '', about: '', cta: '' })).toMatchObject({ ok: false });
  });
});

describe('photos', () => {
  const path = `${BUSINESS_ID}/${ROW_ID}.jpg`;

  it('createPhotoUpload: лимит 50 фото', async () => {
    queueResult('photos', { count: 50 });
    expect(await photos.createPhotoUpload(SLUG, { type: 'image/jpeg', size: 1000 })).toMatchObject({ ok: false });
    expect(storageApi.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('createPhotoUpload: > 5 МБ и неверный тип отклоняются', async () => {
    expect(await photos.createPhotoUpload(SLUG, { type: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatchObject({ ok: false });
    expect(await photos.createPhotoUpload(SLUG, { type: 'image/gif', size: 1000 })).toMatchObject({ ok: false });
  });

  it('createPhotoUpload: путь в папке бизнеса', async () => {
    queueResult('photos', { count: 3 });
    storageApi.createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: 'https://up' }, error: null });
    const r = await photos.createPhotoUpload(SLUG, { type: 'image/webp', size: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.path).toMatch(new RegExp(`^${BUSINESS_ID}/[0-9a-f-]{36}\\.webp$`));
  });

  it('confirmPhotoUpload: чужой путь — forbidden', async () => {
    expect(await photos.confirmPhotoUpload(SLUG, { path: `${OTHER_ID}/${ROW_ID}.jpg`, alt: 'Маникюр' })).toMatchObject({ ok: false });
    expect(storageApi.info).not.toHaveBeenCalled();
  });

  it('confirmPhotoUpload: объект больше лимита удаляется из Storage', async () => {
    storageApi.info.mockResolvedValue({ data: { contentType: 'image/jpeg', size: 9 * 1024 * 1024 }, error: null });
    expect(await photos.confirmPhotoUpload(SLUG, { path, alt: 'Маникюр' })).toMatchObject({ ok: false });
    expect(storageApi.remove).toHaveBeenCalledWith([path]);
  });

  it('confirmPhotoUpload: ошибка insert → откат объекта', async () => {
    storageApi.info.mockResolvedValue({ data: { contentType: 'image/jpeg', size: 1000 }, error: null });
    queueResult('photos', { data: [{ id: OTHER_ID, url: 'u', alt: 'a', path: 'x/old.jpg' }] }, { error: { message: 'x' } });
    expect(await photos.confirmPhotoUpload(SLUG, { path, alt: 'Маникюр' })).toMatchObject({ ok: false });
    expect(storageApi.remove).toHaveBeenCalledWith([path]);
  });

  it('confirmPhotoUpload: успех — запись в конец галереи, путь и подпись сохранены', async () => {
    storageApi.info.mockResolvedValue({ data: { contentType: 'image/png', size: 1000 }, error: null });
    queueResult('photos', { data: [] }, { data: [{ id: ROW_ID, url: 'https://cdn.test/photo.jpg', alt: 'Маникюр' }] });
    expect(await photos.confirmPhotoUpload(SLUG, { path, alt: ' Маникюр ' })).toMatchObject({ ok: true, data: { id: ROW_ID } });
    expect(argOf('photos', 'insert')).toMatchObject({ business_id: BUSINESS_ID, path, alt: 'Маникюр', sort_order: 1 });
    expect(storageApi.remove).not.toHaveBeenCalled();
  });

  it('confirmPhotoUpload: повтор после потерянного ответа не создаёт дубль и не удаляет файл', async () => {
    storageApi.info.mockResolvedValue({ data: { contentType: 'image/jpeg', size: 1000 }, error: null });
    queueResult('photos', { data: [{ id: ROW_ID, url: 'u', alt: 'Маникюр', path }] });
    expect(await photos.confirmPhotoUpload(SLUG, { path, alt: 'Маникюр' })).toMatchObject({ ok: true, data: { id: ROW_ID } });
    expect(opsOf('photos')).not.toContain('insert');
    expect(storageApi.remove).not.toHaveBeenCalled();
  });

  it('confirmPhotoUpload: лимит достигнут, пока файл грузился (две вкладки) → файл удаляется', async () => {
    storageApi.info.mockResolvedValue({ data: { contentType: 'image/jpeg', size: 1000 }, error: null });
    const full = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}`, url: null, alt: null, path: `${BUSINESS_ID}/${i}.jpg` }));
    queueResult('photos', { data: full });
    expect(await photos.confirmPhotoUpload(SLUG, { path, alt: 'Маникюр' })).toMatchObject({ ok: false, error: expect.stringContaining('50') });
    expect(storageApi.remove).toHaveBeenCalledWith([path]);
  });

  it('confirmPhotoUpload: файла нет в Storage — понятная ошибка, в БД не пишем', async () => {
    storageApi.info.mockResolvedValue({ data: null, error: { message: 'not found' } });
    expect(await photos.confirmPhotoUpload(SLUG, { path, alt: 'Маникюр' })).toMatchObject({ ok: false, error: expect.stringContaining('не дошёл') });
    expect(opsOf('photos')).toEqual([]);
  });

  it('updatePhotoAlt: только своё фото, пустая подпись — ошибка поля', async () => {
    expect(await photos.updatePhotoAlt(SLUG, ROW_ID, '')).toMatchObject({ ok: false, fieldErrors: { alt: expect.any(String) } });
    queueResult('photos', { data: [{ id: ROW_ID }] });
    expect(await photos.updatePhotoAlt(SLUG, ROW_ID, 'Педикюр')).toMatchObject({ ok: true });
    expect(hasOp('photos', 'eq', 'business_id', BUSINESS_ID)).toBe(true);
    queueResult('photos', { data: [] });
    expect(await photos.updatePhotoAlt(SLUG, ROW_ID, 'Педикюр')).toMatchObject({ ok: false });
  });

  it('manager не загружает и не удаляет фото', async () => {
    loginAs('manager');
    expect(await photos.createPhotoUpload(SLUG, { type: 'image/jpeg', size: 1000 })).toMatchObject({ ok: false });
    expect(await photos.deletePhoto(SLUG, ROW_ID)).toMatchObject({ ok: false });
    expect(opsOf('photos')).toEqual([]);
  });

  it('confirmPhotoUpload: alt обязателен', async () => {
    expect(await photos.confirmPhotoUpload(SLUG, { path, alt: ' ' })).toMatchObject({ ok: false });
  });

  it('deletePhoto: DELETE с business_id, затем объект из Storage', async () => {
    queueResult('photos', { data: [{ path }] });
    expect(await photos.deletePhoto(SLUG, ROW_ID)).toMatchObject({ ok: true });
    expect(hasOp('photos', 'eq', 'business_id', BUSINESS_ID)).toBe(true);
    expect(storageApi.remove).toHaveBeenCalledWith([path]);
  });
});

describe('team', () => {
  it('inviteManager: только owner', async () => {
    loginAs('manager');
    expect(await team.inviteManager(SLUG, { email: 'm@test.ru' })).toMatchObject({ ok: false });
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  it('inviteManager: уже в команде → ошибка под полем email', async () => {
    queueResult('admin_users', { data: [{ email: 'm@test.ru', role: 'manager' }] });
    const r = await team.inviteManager(SLUG, { email: ' M@Test.ru ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.email).toBeTruthy();
  });

  it('inviteManager: пароль в ответе, cookie не используется', async () => {
    queueResult('admin_users', { data: [] }, { data: { id: ROW_ID, email: 'm@test.ru', role: 'manager' } });
    authAdmin.createUser.mockResolvedValue({ data: { user: { id: 'auth-2' } }, error: null });
    const r = await team.inviteManager(SLUG, { email: 'm@test.ru' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.password).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it('inviteManager: ошибка insert → удаляем созданный auth-аккаунт', async () => {
    queueResult('admin_users', { data: [] }, { error: { message: 'dup' } });
    authAdmin.createUser.mockResolvedValue({ data: { user: { id: 'auth-2' } }, error: null });
    expect(await team.inviteManager(SLUG, { email: 'm@test.ru' })).toMatchObject({ ok: false });
    expect(authAdmin.deleteUser).toHaveBeenCalledWith('auth-2');
  });

  it('removeMember: владельца не удалить — role=manager в WHERE', async () => {
    queueResult('admin_users', { data: [] });
    expect(await team.removeMember(SLUG, ROW_ID)).toMatchObject({ ok: false });
    expect(hasOp('admin_users', 'eq', 'role', 'manager')).toBe(true);
    expect(hasOp('admin_users', 'eq', 'business_id', BUSINESS_ID)).toBe(true);
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('removeMember: удаляет и auth-аккаунт', async () => {
    queueResult('admin_users', { data: [{ auth_user_id: 'auth-9' }] });
    expect(await team.removeMember(SLUG, ROW_ID)).toMatchObject({ ok: true });
    expect(authAdmin.deleteUser).toHaveBeenCalledWith('auth-9');
  });
});

describe('data.requestDeletion', () => {
  it('нужно ввести slug', async () => {
    expect(await data.requestDeletion(SLUG, 'нет')).toMatchObject({ ok: false });
    expect(opsOf('businesses')).toEqual([]);
  });

  it('условный UPDATE и уведомление админу', async () => {
    queueResult('businesses', { data: [{ id: BUSINESS_ID }] });
    const r = await data.requestDeletion(SLUG, ` ${SLUG.toUpperCase()} `);
    expect(r.ok).toBe(true);
    expect(hasOp('businesses', 'neq', 'status', 'pending_deletion')).toBe(true);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
  });

  it('manager не может удалить аккаунт', async () => {
    loginAs('manager');
    expect(await data.requestDeletion(SLUG, SLUG)).toMatchObject({ ok: false });
  });
});

describe('subscription.reportPayment', () => {
  it('только owner', async () => {
    loginAs('manager');
    expect(await subscription.reportPayment(SLUG, { amount: '', comment: '' })).toMatchObject({ ok: false });
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('rate limit — второй раз не отправляем', async () => {
    rateLimit.mockResolvedValue(false);
    expect(await subscription.reportPayment(SLUG, { amount: '', comment: '' })).toMatchObject({ ok: false });
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('пустая сумма → цена тарифа в сообщении', async () => {
    expect(await subscription.reportPayment(SLUG, { amount: '', comment: 'СБП' })).toMatchObject({ ok: true });
    expect(String(notifyAdmin.mock.calls[0]?.[0])).toContain('2500');
  });

  it('сумма не числом — ошибка поля', async () => {
    const r = await subscription.reportPayment(SLUG, { amount: '12abc', comment: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.amount).toBeTruthy();
  });

  it('ни почта, ни Telegram не дошли → ошибка', async () => {
    notifyAdmin.mockResolvedValue(false);
    expect(await subscription.reportPayment(SLUG, { amount: '2500', comment: '' })).toMatchObject({ ok: false });
  });
});
