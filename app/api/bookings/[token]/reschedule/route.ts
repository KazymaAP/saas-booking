// app/api/bookings/[token]/reschedule/route.ts — перенос клиентом по токену (ТЗ §18, §37).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { hitRateLimit } from '@/lib/rate-limit';
import { freeSlotsFor } from '@/lib/availability';
import { notifyBusinessEvent } from '@/lib/notify';

export const runtime = 'nodejs';

const Body = z.object({
  startsAt: z.string().datetime(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!(await hitRateLimit(`reschedule:${ip}`, 10, 900))) {
    return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'validation' }, { status: 400 });
  if (!z.string().uuid().safeParse(params.token).success) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });

  const db = adminClient();
  const { data: booking } = await db
    .from('bookings')
    .select('id, business_id, status, scheduled_at, service_id, services(duration_minutes)')
    .eq('cancel_token', params.token)
    .maybeSingle();
  if (!booking) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });
  if (booking.status !== 'new' && booking.status !== 'confirmed') {
    return NextResponse.json({ ok: false, reason: 'not_reschedulable' }, { status: 409 });
  }

  const { data: business } = await db.from('businesses').select('*').eq('id', booking.business_id).single();
  if (!business) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });

  const hoursLeft = (new Date(booking.scheduled_at).getTime() - Date.now()) / 3_600_000;
  if (hoursLeft < business.cancel_hours_before) {
    return NextResponse.json({ ok: false, reason: 'too_late', phone: business.phones?.[0] ?? null }, { status: 409 });
  }

  const duration = (booking as any).services?.duration_minutes ?? 60;
  const free = await freeSlotsFor(business, { duration_minutes: duration }, parsed.data.date, booking.id);
  if (!free.includes(new Date(parsed.data.startsAt).getTime())) {
    return NextResponse.json({ ok: false, reason: 'slot_taken' }, { status: 409 });
  }

  const { error } = await db
    .from('bookings')
    .update({ scheduled_at: parsed.data.startsAt, reminder_24h_sent_at: null, reminder_2h_sent_at: null })
    .eq('id', booking.id);
  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: false, reason: 'slot_taken' }, { status: 409 });
    return NextResponse.json({ ok: false, reason: 'server' }, { status: 500 });
  }

  await notifyBusinessEvent(business.id, 'reschedule', booking.id).catch(() => undefined);
  return NextResponse.json({ ok: true, status: booking.status, startsAt: parsed.data.startsAt });
}
