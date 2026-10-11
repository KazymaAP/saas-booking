// app/[prefix]/[slug]/booking/cancel/[token]/actions.ts — отмена по токену из страницы (ТЗ §37).
'use server';
import { redirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase';
import { notifyBusinessEvent } from '@/lib/notify';

export async function cancelByToken(prefix: string, slug: string, token: string) {
  const db = adminClient();
  const { data: b } = await db
    .from('bookings')
    .select('id, business_id, status, scheduled_at, businesses(cancel_hours_before, phones)')
    .eq('cancel_token', token).maybeSingle();
  const back = `/${prefix}/${slug}/booking/cancel/${token}`;
  if (!b || (b.status !== 'new' && b.status !== 'confirmed')) redirect(back);

  const hoursLeft = (new Date(b!.scheduled_at).getTime() - Date.now()) / 3_600_000;
  const limit = (b as any).businesses?.cancel_hours_before ?? 3;
  if (hoursLeft < limit) redirect(`${back}?late=1`);

  await db.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'client' }).eq('id', b!.id);
  await notifyBusinessEvent(b!.business_id, 'cancel', b!.id).catch(() => undefined);
  redirect(`${back}?done=1`);
}
