// app/api/bookings/slots/route.ts — свободные слоты на день (ТЗ §54, §41: заняты не показываются).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveBusiness } from '@/lib/business';
import { adminClient } from '@/lib/supabase';
import { freeSlotsFor } from '@/lib/availability';

export const runtime = 'nodejs';

const Query = z.object({
  prefix: z.string().min(1).max(4),
  slug: z.string().min(1).max(80),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = Query.safeParse(sp);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'validation' }, { status: 400 });
  const q = parsed.data;

  const r = await resolveBusiness(q.prefix, q.slug);
  if (r.kind !== 'found') return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });

  const { data: service } = await adminClient()
    .from('services').select('duration_minutes')
    .eq('id', q.serviceId).eq('business_id', r.business.id).eq('is_active', true).maybeSingle();
  if (!service) return NextResponse.json({ ok: false, reason: 'service_not_found' }, { status: 400 });

  const slots = await freeSlotsFor(r.business, service, q.date);
  return NextResponse.json({ ok: true, slots: slots.map((ms) => new Date(ms).toISOString()) });
}
