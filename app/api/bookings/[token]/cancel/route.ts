// app/api/bookings/[token]/cancel/route.ts — отмена брони клиентом по токену (ТЗ §10.4).
// Идемпотентно: повторный вызов → 200 { ok: true, already: true }, без второго уведомления.
// Поздно (меньше cancel_hours_before) → 409 too_late + телефон бизнеса.
import { cancelInput, cancelResponse } from '@/lib/schemas';
import { cancelBooking } from '@/lib/booking-actions';
import { fail, isSameOrigin, limitOrFail, ok } from '@/lib/booking-http';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { token: string } }): Promise<Response> {
  if (isSameOrigin(req) === false) return fail({ reason: 'forbidden' });
  const limited = await limitOrFail('cancel', req);
  if (limited !== null) return limited;

  // Неверный формат токена — тот же ответ, что и «не найдено»: не раскрываем, какие токены бывают.
  const parsed = cancelInput.safeParse({ token: params.token });
  if (parsed.success === false) return fail({ reason: 'not_found' });

  try {
    const result = await cancelBooking(parsed.data.token);
    if (result.ok === false) return fail(result.failure);
    return ok(cancelResponse.parse(result.value));
  } catch (error) {
    await logError('booking', 'cancel_failed', { error: error instanceof Error ? error.message : String(error) });
    return fail({ reason: 'server' });
  }
}
