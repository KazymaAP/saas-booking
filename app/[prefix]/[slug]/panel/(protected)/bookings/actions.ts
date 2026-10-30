// app/[prefix]/[slug]/panel/(protected)/bookings/actions.ts — действия владельца и менеджера над бронями (ТЗ §10.7, §13.10).
'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { sendMail } from '@/lib/notify';
import { logError } from '@/lib/log';
import type { BookingStatus } from '@/lib/database.types';
import { actionAccess } from '../_lib/access';
import { ERR, fail, ok, UUID_RE, type ActionResult } from '../_lib/result';
import { formatDateTime } from '../_lib/time';
import { ACTION_DONE, BOOKING_ACTIONS, TRANSITIONS } from './status';

const Input = z.object({
  id: z.string().regex(UUID_RE, 'Неверная запись'),
  action: z.enum(BOOKING_ACTIONS),
});

export type ChangeStatusInput = z.input<typeof Input>;

type UpdatedBooking = { id: string; status: BookingStatus; scheduled_at: string; client_email: string | null; client_name: string | null };

// Смена статуса — один условный UPDATE: business_id и текущий статус проверяются в WHERE.
// Это и проверка прав (чужую бронь не обновить), и защита от гонки: второй клик «Подтвердить»
// не найдёт строку со статусом new и не отправит клиенту второе письмо.
export async function changeBookingStatus(slug: string, input: ChangeStatusInput): Promise<ActionResult<{ status: BookingStatus }>> {
  const access = await actionAccess(slug); // owner и manager: брони — основная работа менеджера
  if (!access) return fail(ERR.forbidden);
  const parsed = Input.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid);
  const { id, action } = parsed.data;
  const rule = TRANSITIONS[action];

  const patch: Record<string, string> = { status: rule.to };
  if (action === 'cancel') Object.assign(patch, { cancelled_at: new Date().toISOString(), cancelled_by: 'business' });

  const { data, error } = await adminClient()
    .from('bookings')
    .update(patch)
    .eq('id', id)
    .eq('business_id', access.business.id)
    .in('status', [...rule.from])
    .select('id, status, scheduled_at, client_email, client_name')
    .returns<UpdatedBooking[]>();

  if (error) {
    await logError('booking', 'panel: change status failed', { booking_id: id, action, code: error.code });
    return fail(ERR.server);
  }
  const booking = data?.[0];
  if (!booking) return fail('Статус уже изменён. Обновите страницу');

  if (action === 'confirm' && booking.client_email) await notifyConfirmed(booking, access.business.name);

  revalidatePath(`/[prefix]/[slug]/panel`, 'layout'); // дашборд и список броней
  return ok(ACTION_DONE[action], { status: booking.status });
}

// ТЗ §10.7: «Подтвердить» → письмо клиенту booking_confirmed. Ошибка письма не откатывает подтверждение,
// но пишется в журнал (без email и имени клиента — ПД в логи не попадают).
async function notifyConfirmed(booking: UpdatedBooking, businessName: string): Promise<void> {
  if (!booking.client_email) return;
  const greeting = booking.client_name ? `${booking.client_name}, в` : 'В';
  const sent = await sendMail({
    to: booking.client_email,
    subject: `Запись подтверждена — ${businessName}`,
    text: `${greeting}аша запись в «${businessName}» подтверждена: ${formatDateTime(booking.scheduled_at)}.`,
    transactional: true,
  }).catch(() => false);
  if (!sent) await logError('email', 'panel: booking_confirmed not sent', { booking_id: booking.id });
}
