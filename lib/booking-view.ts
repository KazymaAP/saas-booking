// lib/booking-view.ts — данные для страниц отмены и переноса по токену (Server Components). Только сервер.
// Один запрос (bookingByToken: бронь + услуга + бизнес), решение «что показать» — чистая функция viewOf,
// поэтому кнопка «Отменить»/«Перенести» не показывается, если действие уже невозможно (ТЗ §10.4, §10.5).
import { z } from 'zod';
import { adminClient } from './supabase';
import { businessTimeZone } from './availability';
import { bookingByToken, businessPhone, cancelHoursBefore, isActive, maxReschedules, rescheduleCount, withinCancelWindow, type TokenBooking } from './booking-actions';
import { formatSlotDateTime } from './slots';
import { tokenSchema } from './schemas';
import type { ClientSchedule } from './booking-dates';

export type BookingAction = 'cancel' | 'reschedule';

// Что показать на странице. 'open' — действие доступно; остальные — объяснение без кнопки.
export type ViewState = 'not_found' | 'cancelled' | 'closed' | 'too_late' | 'limit' | 'open';

export type BookingView = {
  state: ViewState;
  serviceName: string | null;
  businessName: string;
  when: string;
  startsAt: string;
  timeZone: string;
  phone: string | null;
  cancelHours: number;
  serviceId: string | null;
  status: string;
  // Расписание бизнеса для выбора новой даты в форме переноса (пояс, min/max, рабочие дни).
  schedule: ClientSchedule;
  // Сколько переносов осталось (для подсказки на странице переноса).
  reschedulesLeft: number;
};

// Решение без БД: статус → окно отмены → лимит переносов (только для переноса).
export function viewStateOf(booking: TokenBooking, action: BookingAction, reschedules: number, nowMs: number): ViewState {
  if (booking.status === 'cancelled') return 'cancelled';
  if (isActive(booking.status) === false) return 'closed';
  if (withinCancelWindow(booking, nowMs) === false) return 'too_late';
  if (action === 'reschedule' && reschedules >= maxReschedules(booking)) return 'limit';
  return 'open';
}

function toView(booking: TokenBooking, state: ViewState, reschedules: number): BookingView {
  const timeZone = businessTimeZone(booking.businesses);
  const startsAt = new Date(booking.scheduled_at).toISOString();
  return {
    state,
    serviceName: booking.services?.name ?? null,
    businessName: booking.businesses.name,
    when: formatSlotDateTime(startsAt, timeZone),
    startsAt,
    timeZone,
    phone: businessPhone(booking),
    cancelHours: cancelHoursBefore(booking),
    serviceId: booking.service_id ?? null,
    status: booking.status,
    schedule: {
      timeZone,
      minHoursBefore: booking.businesses.min_hours_before,
      maxDaysAhead: booking.businesses.max_days_ahead,
      workingHours: booking.businesses.working_hours,
    },
    reschedulesLeft: Math.max(0, maxReschedules(booking) - reschedules),
  };
}

// Страница бизнеса /{prefix}/{slug}/booking/... : бронь чужого бизнеса по этому адресу не показываем.
export async function loadBookingView(
  rawToken: string,
  action: BookingAction,
  expectedSlug: string | null,
  nowMs: number = Date.now(),
): Promise<BookingView | null> {
  const token = tokenSchema.safeParse(rawToken);
  if (token.success === false) return null;
  const booking = await bookingByToken(token.data);
  if (booking === null) return null;
  if (expectedSlug !== null && booking.businesses.slug !== expectedSlug) return null;
  // Счётчик переносов нужен только странице переноса и только для активной брони в окне.
  const needsCount = action === 'reschedule' && isActive(booking.status) && withinCancelWindow(booking, nowMs);
  const count = needsCount ? await rescheduleCount(booking) : 0;
  return toView(booking, viewStateOf(booking, action, count, nowMs), count);
}

// Короткий адрес из письма /booking/{action}/{token} → адрес на сайте бизнеса.
const SiteRow = z.object({
  businesses: z.object({ slug: z.string(), vertical_templates: z.object({ url_prefix: z.string() }).nullable() }).nullable(),
});

export async function bookingSitePath(rawToken: string, action: BookingAction): Promise<string | null> {
  const token = tokenSchema.safeParse(rawToken);
  if (token.success === false) return null;
  const { data, error } = await adminClient()
    .from('bookings')
    .select('businesses(slug, vertical_templates(url_prefix))')
    .eq('cancel_token', token.data)
    .maybeSingle();
  if (error) throw new Error(`bookingSitePath: ${error.code ?? ''} ${error.message}`);
  const parsed = SiteRow.safeParse(data);
  const business = parsed.success ? parsed.data.businesses : null;
  const prefix = business?.vertical_templates?.url_prefix;
  if (business === null || business === undefined || prefix === undefined) return null;
  return `/${prefix}/${business.slug}/booking/${action}/${token.data}`;
}
