// lib/availability.ts — единая точка расчёта доступности (используется слотами, бронированием и переносом).
import { adminClient } from './supabase';
import { freeSlots, type BusyInterval } from './slots';
import type { Business, Service, WorkingHours } from './database.types';

export async function busyForDay(businessId: string, date: string, excludeBookingId?: string): Promise<BusyInterval[]> {
  const dayStart = new Date(`${date}T00:00:00+03:00`).getTime() - 86_400_000;
  const dayEnd = dayStart + 3 * 86_400_000;
  let q = adminClient()
    .from('bookings')
    .select('id, scheduled_at, services(duration_minutes)')
    .eq('business_id', businessId)
    .in('status', ['new', 'confirmed'])
    .gte('scheduled_at', new Date(dayStart).toISOString())
    .lt('scheduled_at', new Date(dayEnd).toISOString());
  if (excludeBookingId) q = q.neq('id', excludeBookingId);
  const { data } = await q;
  return (data ?? []).map((r: any) => {
    const start = new Date(r.scheduled_at).getTime();
    const dur = (r.services?.duration_minutes ?? 60) * 60_000;
    return { start, end: start + dur };
  });
}

export async function freeSlotsFor(
  business: Business,
  service: Pick<Service, 'duration_minutes'>,
  date: string,
  excludeBookingId?: string,
): Promise<number[]> {
  const busy = await busyForDay(business.id, date, excludeBookingId);
  return freeSlots({
    date,
    workingHours: business.working_hours as WorkingHours | null,
    durationMinutes: service.duration_minutes,
    stepMinutes: business.slot_step_minutes,
    busy,
    nowMs: Date.now(),
    minHoursBefore: business.min_hours_before,
    maxDaysAhead: business.max_days_ahead,
  });
}
