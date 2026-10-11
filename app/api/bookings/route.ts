// app/api/bookings/route.ts — создание брони (ТЗ §5.2, §41, §42, §54).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { hitRateLimit } from '@/lib/rate-limit';
import { normalizePhone } from '@/lib/phone';
import { freeSlots } from '@/lib/slots';
import { notifyBusinessEvent } from '@/lib/notify';
import { notifyAdmin } from '@/lib/admin-notify';
import { resolveBusiness } from '@/lib/business';
import type { WorkingHours } from '@/lib/database.types';

export const runtime = 'nodejs';

const PRIVACY_VERSION = '2026-10-01';

const BodySchema = z.object({
  prefix: z.string().min(1).max(4),
  slug: z.string().min(1).max(80),
  serviceId: z.string().uuid(),
  startsAt: z.string().datetime(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(10).max(20),
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  telegram: z.string().trim().max(64).optional(),
  comment: z.string().trim().max(500).optional(),
  privacyAccepted: z.literal(true),
});

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await hitRateLimit(`booking:${ip}`, 5, 600))) {
    return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: 'validation', issues: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const phone = normalizePhone(data.phone);
  if (!phone) return NextResponse.json({ ok: false, reason: 'validation', field: 'phone' }, { status: 400 });

  const resolved = await resolveBusiness(data.prefix, data.slug);
  if (resolved.kind !== 'found') return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });
  const business = resolved.business;

  const db = adminClient();
  const { data: service } = await db
    .from('services').select('*').eq('id', data.serviceId).eq('business_id', business.id).eq('is_active', true).maybeSingle();
  if (!service) return NextResponse.json({ ok: false, reason: 'service_not_found' }, { status: 400 });

  // Занятость на этот день (с запасом по времени: берём окно дня ±1 сутки в UTC).
  const dayStart = new Date(`${data.date}T00:00:00Z`).getTime() - 86_400_000;
  const dayEnd = dayStart + 3 * 86_400_000;
  const { data: busyRows } = await db
    .from('bookings').select('scheduled_at, services(duration_minutes)')
    .eq('business_id', business.id).in('status', ['new', 'confirmed'])
    .gte('scheduled_at', new Date(dayStart).toISOString()).lt('scheduled_at', new Date(dayEnd).toISOString());

  const busy = (busyRows ?? []).map((r: any) => {
    const start = new Date(r.scheduled_at).getTime();
    const dur = (r.services?.duration_minutes ?? 60) * 60_000;
    return { start, end: start + dur };
  });

  const free = freeSlots({
    date: data.date,
    workingHours: business.working_hours as WorkingHours | null,
    durationMinutes: service.duration_minutes,
    stepMinutes: business.slot_step_minutes,
    busy,
    nowMs: Date.now(),
    minHoursBefore: business.min_hours_before,
    maxDaysAhead: business.max_days_ahead,
  });

  const startMs = new Date(data.startsAt).getTime();
  if (!free.includes(startMs)) {
    return NextResponse.json({ ok: false, reason: 'slot_taken' }, { status: 409 });
  }

  const { data: booking, error } = await db
    .from('bookings')
    .insert({
      business_id: business.id,
      client_name: data.name,
      client_phone: phone,
      client_email: data.email || null,
      client_telegram: data.telegram || null,
      service_id: service.id,
      scheduled_at: data.startsAt,
      comment: data.comment || null,
      status: business.auto_confirm ? 'confirmed' : 'new',
      privacy_accepted_at: new Date().toISOString(),
      privacy_ip: ip,
      privacy_version: PRIVACY_VERSION,
    })
    .select('id, cancel_token, status')
    .single();

  // Уникальный индекс bookings_slot_unique защищает от гонки (§41).
  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: false, reason: 'slot_taken' }, { status: 409 });
    return NextResponse.json({ ok: false, reason: 'server' }, { status: 500 });
  }

  await notifyBusinessEvent(business.id, 'new', booking.id).catch(() => undefined); // §5.2: бизнесу сразу
  await notifyAdmin(`🎉 Бронь: ${business.name}, ${data.name}, ${data.startsAt}`);
  return NextResponse.json({ ok: true, bookingId: booking.id, cancelToken: booking.cancel_token, status: booking.status }, { status: 201 });
}
