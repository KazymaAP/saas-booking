// app/api/bookings/[token]/reschedule/route.ts — перенос брони клиентом по токену (ТЗ §10.5).
// Проверки: статус, cancel_hours_before (409 too_late + телефон), max_reschedules (409 reschedule_limit),
// свободный слот (409 slot_taken). При переносе reminder_*_sent_at сбрасываются — напоминания уйдут заново.
// Идемпотентно: повтор на то же время → 200 { already: true }.
import { cancelInput, rescheduleInput, rescheduleResponse } from '@/lib/schemas';
import { rescheduleBooking } from '@/lib/booking-actions';
import { fail, isSameOrigin, limitOrFail, ok, readJson, validationFailure } from '@/lib/booking-http';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { token: string } }): Promise<Response> {
  if (isSameOrigin(req) === false) return fail({ reason: 'forbidden' });
  const limited = await limitOrFail('reschedule', req);
  if (limited !== null) return limited;

  const token = cancelInput.safeParse({ token: params.token });
  if (token.success === false) return fail({ reason: 'not_found' });
  const body = rescheduleInput.safeParse(await readJson(req));
  if (body.success === false) return fail(validationFailure(body.error));

  try {
    const result = await rescheduleBooking(token.data.token, body.data);
    if (result.ok === false) return fail(result.failure);
    return ok(rescheduleResponse.parse(result.value));
  } catch (error) {
    await logError('booking', 'reschedule_failed', { error: error instanceof Error ? error.message : String(error) });
    return fail({ reason: 'server' });
  }
}
