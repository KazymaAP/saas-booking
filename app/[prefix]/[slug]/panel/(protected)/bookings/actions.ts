// app/[prefix]/[slug]/panel/(protected)/bookings/actions.ts — действия владельца над бронями (ТЗ §5.3, §38).
'use server';
import { revalidatePath } from 'next/cache';
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';
import { sendMail } from '@/lib/notify';

type Action = 'confirm' | 'done' | 'no_show' | 'cancel';
const NEXT: Record<Action, { from: string[]; to: string }> = {
  confirm: { from: ['new'], to: 'confirmed' },
  done: { from: ['confirmed', 'new'], to: 'done' },
  no_show: { from: ['confirmed', 'new'], to: 'no_show' },
  cancel: { from: ['new', 'confirmed'], to: 'cancelled' },
};

export async function changeBookingStatus(prefix: string, slug: string, formData: FormData) {
  const access = await currentOwner(slug);
  if (!access) return;
  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('action') ?? '') as Action;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !NEXT[action]) return;

  const db = adminClient();
  const { data: booking } = await db
    .from('bookings').select('id, business_id, status, scheduled_at, client_email, client_name')
    .eq('id', id).maybeSingle();
  if (!booking || booking.business_id !== access.business.id) return;
  if (!NEXT[action].from.includes(booking.status)) return;

  const patch: Record<string, unknown> = { status: NEXT[action].to };
  if (action === 'cancel') Object.assign(patch, { cancelled_at: new Date().toISOString(), cancelled_by: 'business' });
  await db.from('bookings').update(patch).eq('id', id);

  // §38: при подтверждении — письмо клиенту «Подтверждено»
  if (action === 'confirm' && booking.client_email) {
    const when = new Date(booking.scheduled_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    await sendMail({
      to: booking.client_email,
      subject: 'Запись подтверждена',
      text: `${booking.client_name ?? ''}, ваша запись подтверждена: ${when}.`,
    }).catch(() => false);
  }
  revalidatePath(`/${prefix}/${access.business.slug}/panel/bookings`);
}
