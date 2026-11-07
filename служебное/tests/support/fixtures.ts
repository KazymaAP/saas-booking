// tests/support/fixtures.ts — тестовые данные E2E: свой бизнес на каждый тест (уникальный slug), услуга, брони.
// Бизнес работает круглосуточно — тесты не зависят от времени запуска. Пояс — Europe/Moscow (дефолт старой схемы).
// После теста бизнес удаляется (каскадно уходят услуги и брони).
import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { testDb } from './env';

export const TEMPLATE_PREFIX = 'b'; // барбершоп из 0003_seed.sql
export const BUSINESS_PHONE = '+79990001122';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const ALL_DAY = [{ open: '00:00', close: '24:00' }];
const WEEK = { mon: ALL_DAY, tue: ALL_DAY, wed: ALL_DAY, thu: ALL_DAY, fri: ALL_DAY, sat: ALL_DAY, sun: ALL_DAY };

export type TestBusiness = { id: string; slug: string; prefix: string; serviceId: string; serviceName: string; path: string };
export type BookingOverrides = { startsAt?: Date; status?: 'new' | 'confirmed' | 'cancelled' };
export type TestBooking = { id: string; token: string; startsAt: string };

async function templateId(): Promise<string> {
  const { data, error } = await testDb().from('vertical_templates').select('id').eq('url_prefix', TEMPLATE_PREFIX).single();
  if (error || data === null) throw new Error(`fixtures: шаблон '${TEMPLATE_PREFIX}' не найден — примените миграции`);
  return String(data.id);
}

export async function createBusiness(options: { autoConfirm?: boolean } = {}): Promise<TestBusiness> {
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  const db = testDb();
  const { data: business, error } = await db
    .from('businesses')
    .insert({
      slug,
      name: `E2E Студия ${slug}`,
      vertical_template_id: await templateId(),
      status: 'client',
      working_hours: WEEK,
      slot_step_minutes: 60,
      cancel_hours_before: 3,
      min_hours_before: 2,
      max_days_ahead: 30,
      auto_confirm: options.autoConfirm ?? false,
      phones: [BUSINESS_PHONE],
    })
    .select('id')
    .single();
  if (error || business === null) throw new Error(`fixtures: бизнес не создан: ${error?.message ?? ''}`);
  const serviceName = 'Стрижка E2E';
  const { data: service, error: serviceError } = await db
    .from('services')
    .insert({ business_id: business.id, name: serviceName, price: 1500, duration_minutes: 60, sort_order: 0, is_active: true })
    .select('id')
    .single();
  if (serviceError || service === null) throw new Error(`fixtures: услуга не создана: ${serviceError?.message ?? ''}`);
  const id = String(business.id);
  return { id, slug, prefix: TEMPLATE_PREFIX, serviceId: String(service.id), serviceName, path: `/${TEMPLATE_PREFIX}/${slug}` };
}

export async function removeBusiness(business: TestBusiness): Promise<void> {
  await testDb().from('businesses').delete().eq('id', business.id);
}

// Начало часа через days суток (UTC). Бизнес круглосуточный, шаг 60 мин — это всегда граница слота.
export function hourIn(days: number, extraHours = 0): Date {
  const ms = Date.now() + days * DAY_MS + extraHours * HOUR_MS;
  return new Date(Math.ceil(ms / HOUR_MS) * HOUR_MS);
}

export async function createBooking(business: TestBusiness, overrides: BookingOverrides = {}): Promise<TestBooking> {
  const startsAt = (overrides.startsAt ?? hourIn(2)).toISOString();
  const { data, error } = await testDb()
    .from('bookings')
    .insert({
      business_id: business.id,
      service_id: business.serviceId,
      scheduled_at: startsAt,
      client_name: 'Тест Клиент',
      client_phone: '+79991234567',
      status: overrides.status ?? 'new',
      privacy_accepted_at: new Date().toISOString(),
      privacy_version: 'e2e',
    })
    .select('id, cancel_token')
    .single();
  if (error || data === null) throw new Error(`fixtures: бронь не создана: ${error?.message ?? ''}`);
  return { id: String(data.id), token: String(data.cancel_token), startsAt };
}

export type BookingRow = { status: string; scheduled_at: string; cancelled_by: string | null; reminder_24h_sent_at: string | null };

export async function readBooking(id: string): Promise<BookingRow> {
  const { data, error } = await testDb()
    .from('bookings')
    .select('status, scheduled_at, cancelled_by, reminder_24h_sent_at')
    .eq('id', id)
    .single();
  if (error || data === null) throw new Error(`fixtures: бронь ${id} не найдена`);
  return data as BookingRow;
}

export async function bookingsOf(business: TestBusiness): Promise<{ id: string; status: string; scheduled_at: string }[]> {
  const { data } = await testDb().from('bookings').select('id, status, scheduled_at').eq('business_id', business.id).limit(50);
  return (data ?? []) as { id: string; status: string; scheduled_at: string }[];
}

export async function auditCount(action: string, bookingId: string): Promise<number> {
  const { count } = await testDb().from('audit_log').select('id', { count: 'exact', head: true }).eq('action', action).eq('entity_id', bookingId);
  return count ?? 0;
}

// Уникальный «IP» клиента на тест: rate limit считается по x-forwarded-for, тесты не мешают друг другу.
export function uniqueIp(): string {
  const bytes = randomUUID().replace(/-/g, '').slice(0, 6);
  return `10.${parseInt(bytes.slice(0, 2), 16)}.${parseInt(bytes.slice(2, 4), 16)}.${parseInt(bytes.slice(4, 6), 16)}`;
}

type Fixtures = { business: TestBusiness; clientIp: string };

export const test = base.extend<Fixtures>({
  clientIp: async ({}, use) => {
    await use(uniqueIp());
  },
  // Заголовок IP — и для страниц, и для fetch из браузера, и для request-контекста.
  extraHTTPHeaders: async ({ clientIp }, use) => {
    await use({ 'x-forwarded-for': clientIp });
  },
  business: async ({}, use) => {
    const business = await createBusiness();
    await use(business);
    await removeBusiness(business);
  },
});

export { expect };
