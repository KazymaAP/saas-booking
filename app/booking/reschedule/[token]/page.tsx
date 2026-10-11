// app/booking/reschedule/[token]/page.tsx — адрес из ТЗ §54 (/booking/reschedule/[token]). Переводит на страницу бизнеса.
import { redirect, notFound } from 'next/navigation';
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function RescheduleShortPage({ params }: { params: { token: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.token)) notFound();
  const { data } = await adminClient()
    .from('bookings')
    .select('businesses(slug, vertical_templates(url_prefix))')
    .eq('cancel_token', params.token)
    .maybeSingle();
  const biz = (data as any)?.businesses;
  const prefix = biz?.vertical_templates?.url_prefix;
  if (!biz?.slug || !prefix) notFound();
  redirect(`/${prefix}/${biz.slug}/booking/reschedule/${params.token}`);
}
