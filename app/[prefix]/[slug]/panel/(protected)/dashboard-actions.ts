// app/[prefix]/[slug]/panel/(protected)/dashboard-actions.ts — ручное добавление записи владельцем.
// Аналог блока «Добавить запись вручную» из старого кабинета Детейленг, но наша схема и наш стиль.
'use server';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { normalizePhone } from '@/lib/phone';
import { businessTimeZone } from '@/lib/availability';
import { wallTimeToUtc } from '@/lib/slots';
import { logError } from '@/lib/log';
import { actionAccess } from './_lib/access';
import { ERR, fail, ok, UUID_RE, type ActionResult } from './_lib/result';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ManualBookingInput = {
  serviceId: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email?: string;
  comment?: string;
};

export async function createManualBookingAction(slug: string, input: ManualBookingInput): Promise<ActionResult> {
  const access = await actionAccess(slug);
  if (!access) return fail(ERR.forbidden);
  const b = access.business;

  // Валидация до обращения к БД: регулярка на формат даты недостаточна — 2026-02-30 проходит
  // /\d{4}-\d{2}-\d{2}/, но не является датой. wallTimeToUtc сам проверяет и календарь, и часы.
  const name = (input.name ?? '').trim();
  const date = (input.date ?? '').trim();
  const time = (input.time ?? '').trim();
  const email = (input.email ?? '').trim();
  const comment = (input.comment ?? '').trim();
  const phone = normalizePhone(input.phone ?? '');

  if (!UUID_RE.test(input.serviceId ?? '')) return fail('Выберите услугу');
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return fail('Укажите дату и время');
  if (name.length < 2 || name.length > 120) return fail('Укажите имя клиента');
  if (phone === null) return fail('Проверьте телефон');
  if (email && (!EMAIL_RE.test(email) || email.length > 200)) return fail('Проверьте почту');
  if (comment.length > 2000) return fail('Комментарий слишком длинный');

  // Время вводится в часовом поясе бизнеса, а не в UTC+3: businesses.timezone может быть любой
  // IANA-зоной (Владивосток, Калининград). Иначе слот попадёт не в тот момент и constraint
  // bookings_no_overlap не заметит пересечение с онлайн-записью — получится двойная бронь.
  const timeZone = businessTimeZone(b);
  const startMs = wallTimeToUtc(date, time, timeZone);
  if (startMs === null) return fail('Укажите дату и время');
  const startsAt = new Date(startMs);

  const db = adminClient() as any;
  const { data: service, error: serviceError } = await db
    .from('services')
    .select('id, name, price, duration_minutes')
    .eq('id', input.serviceId)
    .eq('business_id', b.id)
    .eq('is_active', true)
    .maybeSingle();
  if (serviceError) {
    await logError('booking', 'manual_service_load_failed', { error: serviceError.message, business: b.id });
    return fail(ERR.server);
  }
  if (!service) return fail('Услуга не найдена');

  const nowIso = new Date().toISOString();
  const base = {
    business_id: b.id,
    service_id: service.id,
    scheduled_at: startsAt.toISOString(),
    client_name: name,
    client_phone: phone,
    client_email: email || null,
    comment: comment || null,
    // Запись, которую вносит владелец, сразу подтверждена: клиент уже договорился по телефону.
    status: 'confirmed',
  };
  const duration = Number(service.duration_minutes);
  const price = Number(service.price);
  const extended = {
    duration_at_booking: Number.isFinite(duration) && duration > 0 ? duration : 60,
    price_at_booking: Number.isFinite(price) && price >= 0 ? price : 0,
    timezone: timeZone,
    source: 'panel',
    confirmed_at: nowIso,
  };

  let res = await db.from('bookings').insert({ ...base, ...extended }).select('id').single();
  // Старая схема без новых колонок — повторяем с базовым набором, как публичное создание.
  if (res.error && ['42703', 'PGRST204'].includes(String(res.error.code))) {
    res = await db.from('bookings').insert(base).select('id').single();
  }
  if (res.error) {
    const code = String(res.error.code);
    // 23505 — уникальный слот, 23P01 — exclusion-ограничение bookings_no_overlap.
    // Второй код раньше отдавал общее «Что-то пошло не так», хотя время просто занято.
    if (code === '23505' || code === '23P01') return fail('Это время уже занято другой записью');
    await logError('booking', 'manual_insert_failed', { error: res.error.message, business: b.id, code });
    return fail(ERR.server);
  }

  revalidatePath('/[prefix]/[slug]/panel', 'page');
  revalidatePath('/[prefix]/[slug]/panel/bookings', 'page');
  return ok('Запись добавлена');
}
