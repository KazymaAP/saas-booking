// app/api/bookings/slots/route.ts — свободные слоты услуги на день (ТЗ §10.1).
// GET ?prefix&slug&serviceId&date. Ответ кэшируется на 10 секунд (браузер + CDN): слоты меняются только
// при новой брони, а финальная проверка всё равно происходит в POST /api/bookings (409 slot_taken).
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { resolveBusiness } from '@/lib/business';
import { freeSlotsFor } from '@/lib/availability';
import { slotsQuery, slotsResponse, type SlotsResponse } from '@/lib/schemas';
import { fail, limitOrFail, ok, validationFailure } from '@/lib/booking-http';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_SECONDS = 10;
const CACHE_HEADERS = { 'Cache-Control': `public, max-age=${CACHE_SECONDS}`, Vary: 'Accept-Encoding' };

const ServiceTimingRow = z.object({
  duration_minutes: z.number().int().positive(),
  buffer_before: z.number().int().nullable().optional(),
  buffer_after: z.number().int().nullable().optional(),
});

async function loadTiming(businessId: string, serviceId: string): Promise<z.infer<typeof ServiceTimingRow> | null> {
  // select('*') по PK — чтобы прочитать buffer_* в новой схеме и не упасть на старой.
  const { data, error } = await adminClient()
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`services: ${error.code ?? ''} ${error.message}`);
  const parsed = ServiceTimingRow.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function GET(req: Request): Promise<Response> {
  const limited = await limitOrFail('slots', req);
  if (limited !== null) return limited;

  const parsed = slotsQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (parsed.success === false) return fail(validationFailure(parsed.error));
  const query = parsed.data;

  try {
    const resolved = await resolveBusiness(query.prefix, query.slug);
    if (resolved.kind !== 'found') return fail({ reason: 'not_found' });
    const timing = await loadTiming(resolved.business.id, query.serviceId);
    if (timing === null) return fail({ reason: 'service_not_found' });

    const slots = await freeSlotsFor(resolved.business, timing, query.date);
    // Валидация ответа: в браузер уходит только то, что описано схемой.
    const body: SlotsResponse = slotsResponse.parse({ ok: true, slots: slots.map((ms) => new Date(ms).toISOString()) });
    return ok(body, { headers: CACHE_HEADERS });
  } catch (error) {
    await logError('booking', 'slots_failed', { error: error instanceof Error ? error.message : String(error) });
    return fail({ reason: 'server' });
  }
}
