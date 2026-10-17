// app/api/bookings/route.ts — создание брони клиентом (ТЗ §10.3).
// Порядок: CSRF → rate limit 5/10мин/IP → zod (общая схема lib/schemas) → бизнес → услуга и занятость
// параллельно → проверка слота (working_hours, business_holidays, min_hours_before, max_days_ahead, буферы)
// → INSERT (23505/23P01 → 409 slot_taken) → уведомления ('confirm' при auto_confirm, иначе 'new') → audit_log.
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { resolveBusiness } from '@/lib/business';
import { normalizePhone } from '@/lib/phone';
import { localDateOf } from '@/lib/slots';
import { businessTimeZone, loadDayContext, slotsForDay } from '@/lib/availability';
import { bookingCreated, bookingInput, PRIVACY_VERSION, type BookingCreated, type BookingInput } from '@/lib/schemas';
import { clientIp } from '@/lib/rate-limit';
import { fail, isSameOrigin, limitOrFail, ok, readJson, validationFailure } from '@/lib/booking-http';
import { notifyCreated } from '@/lib/booking-notify';
import { audit } from '@/lib/audit';
import { logError } from '@/lib/log';
import type { Business } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Postgres: unique_violation (bookings_slot_unique) и exclusion_violation (bookings_no_overlap, ТЗ §10.2).
const SLOT_CONFLICT_CODES = new Set(['23505', '23P01']);
// PostgREST: колонки нет в схеме — старая схема без duration_at_booking/timezone (ТЗ §4.10).
const MISSING_COLUMN_CODES = new Set(['PGRST204', '42703']);

const ServiceRow = z.object({
  id: z.string(),
  name: z.string(),
  duration_minutes: z.number().int().positive(),
  buffer_before: z.number().int().nullable().optional(),
  buffer_after: z.number().int().nullable().optional(),
});
type ServiceRowT = z.infer<typeof ServiceRow>;

const InsertedRow = z.object({ id: z.string(), cancel_token: z.string(), status: z.string(), scheduled_at: z.string() });

type BusinessWithZone = Business & { timezone?: string | null };

// Услуга бизнеса по id; select('*') — чтобы прочитать buffer_* в новой схеме (одна строка по PK).
async function loadService(businessId: string, serviceId: string): Promise<ServiceRowT | null> {
  const { data, error } = await adminClient()
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`services: ${error.code ?? ''} ${error.message}`);
  const parsed = ServiceRow.safeParse(data);
  return parsed.success ? parsed.data : null;
}

type InsertResult = { kind: 'ok'; row: z.infer<typeof InsertedRow> } | { kind: 'conflict' } | { kind: 'error'; message: string };

// INSERT брони. Если новых колонок ТЗ §4.10 ещё нет — повтор с базовым набором (только на старой схеме).
async function insertBooking(base: Record<string, unknown>, extended: Record<string, unknown>): Promise<InsertResult> {
  const db = adminClient();
  const columns = 'id, cancel_token, status, scheduled_at';
  let res = await db.from('bookings').insert({ ...base, ...extended }).select(columns).single();
  if (res.error && MISSING_COLUMN_CODES.has(res.error.code ?? '')) {
    res = await db.from('bookings').insert(base).select(columns).single();
  }
  if (res.error) {
    if (SLOT_CONFLICT_CODES.has(res.error.code ?? '')) return { kind: 'conflict' };
    return { kind: 'error', message: `${res.error.code ?? ''} ${res.error.message}` };
  }
  const row = InsertedRow.safeParse(res.data);
  return row.success ? { kind: 'ok', row: row.data } : { kind: 'error', message: 'insert: неожиданный ответ' };
}

function bookingRows(input: BookingInput, business: BusinessWithZone, service: ServiceRowT, phone: string, ip: string) {
  const status = business.auto_confirm ? 'confirmed' : 'new';
  const nowIso = new Date().toISOString();
  const base = {
    business_id: business.id,
    service_id: service.id,
    scheduled_at: new Date(input.startsAt).toISOString(),
    client_name: input.name,
    client_phone: phone,
    client_email: input.email || null,
    client_telegram: input.telegram ? input.telegram.replace(/^@/, '') : null,
    comment: input.comment || null,
    status,
    privacy_accepted_at: nowIso,
    privacy_ip: ip,
    privacy_version: PRIVACY_VERSION,
  };
  const extended = {
    duration_at_booking: service.duration_minutes,
    timezone: businessTimeZone(business),
    source: 'site',
    ...(status === 'confirmed' ? { confirmed_at: nowIso } : {}),
  };
  return { base, extended };
}

async function createBooking(req: Request, input: BookingInput): Promise<Response> {
  const phone = normalizePhone(input.phone);
  if (phone === null) return fail({ reason: 'validation', field: 'phone' });

  const resolved = await resolveBusiness(input.prefix, input.slug);
  if (resolved.kind !== 'found') return fail({ reason: 'not_found' });
  const business: BusinessWithZone = resolved.business;
  const timeZone = businessTimeZone(business);

  // Слот должен принадлежать выбранной дате в поясе бизнеса — иначе дата и время рассинхронизированы.
  const startMs = Date.parse(input.startsAt);
  if (localDateOf(startMs, timeZone) !== input.date) return fail({ reason: 'validation', field: 'startsAt' });

  // Услуга и занятость дня независимы — параллельно, один RTT.
  const [service, day] = await Promise.all([loadService(business.id, input.serviceId), loadDayContext(business, input.date)]);
  if (service === null) return fail({ reason: 'service_not_found' });

  // freeSlots учитывает working_hours, business_holidays, min_hours_before, max_days_ahead и буферы (ТЗ §10.1).
  if (slotsForDay(business, service, input.date, day).includes(startMs) === false) return fail({ reason: 'slot_taken' });

  const { base, extended } = bookingRows(input, business, service, phone, clientIp(req.headers));
  const inserted = await insertBooking(base, extended);
  if (inserted.kind === 'conflict') return fail({ reason: 'slot_taken' });
  if (inserted.kind === 'error') {
    await logError('booking', 'insert_failed', { business: business.id, error: inserted.message });
    return fail({ reason: 'server' });
  }

  const body: BookingCreated = bookingCreated.parse({
    ok: true,
    bookingId: inserted.row.id,
    cancelToken: inserted.row.cancel_token,
    status: inserted.row.status,
    startsAt: new Date(inserted.row.scheduled_at).toISOString(),
  });

  await Promise.all([
    notifyCreated({
      business,
      serviceName: service.name,
      startsAt: body.startsAt,
      timeZone,
      clientName: input.name,
      clientPhone: phone,
      autoConfirmed: body.status === 'confirmed',
    }),
    // audit_log без PII: только идентификаторы и статус (ТЗ §10.3 п.10).
    audit('booking_created', 'booking', body.bookingId, { business: business.id, status: body.status, source: 'site' }).catch(
      (error: unknown) => logError('booking', 'audit_failed', { error: String(error) }),
    ),
  ]);
  return ok(body, { status: 201 });
}

export async function POST(req: Request): Promise<Response> {
  if (isSameOrigin(req) === false) return fail({ reason: 'forbidden' });
  const limited = await limitOrFail('booking', req);
  if (limited !== null) return limited;

  const parsed = bookingInput.safeParse(await readJson(req));
  if (parsed.success === false) return fail(validationFailure(parsed.error));

  try {
    return await createBooking(req, parsed.data);
  } catch (error) {
    await logError('booking', 'create_failed', { error: error instanceof Error ? error.message : String(error) });
    return fail({ reason: 'server' });
  }
}
