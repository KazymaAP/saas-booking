// app/[prefix]/[slug]/booking/reschedule/[token]/page.tsx — перенос записи по ссылке (ТЗ §18, §37).
import { adminClient } from '@/lib/supabase';
import { RescheduleForm } from './RescheduleForm';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function ReschedulePage({ params }: { params: { prefix: string; slug: string; token: string } }) {
  const { data: b } = await adminClient()
    .from('bookings')
    .select('status, scheduled_at, service_id, services(name, duration_minutes), businesses(name, phones, cancel_hours_before)')
    .eq('cancel_token', params.token).maybeSingle();

  if (!b) return <Msg text="Запись не найдена." />;
  if (b.status !== 'new' && b.status !== 'confirmed') return <Msg text="Эту запись нельзя перенести онлайн." />;
  const biz = (b as any).businesses;
  const when = new Date(b.scheduled_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  return (
    <main className="mx-auto max-w-[520px] px-4 py-10">
      <h1 className="text-[24px] font-semibold">Перенос записи</h1>
      <p className="mt-3">{(b as any).services?.name} · {biz?.name}</p>
      <p className="text-[#666666]">Сейчас: {when}</p>
      <RescheduleForm token={params.token} serviceId={b.service_id as string} prefix={params.prefix} slug={params.slug} />
      <p className="mt-6 text-[14px] text-[#666666]">Перенос возможен не позднее чем за {biz?.cancel_hours_before} ч. Если времени мало, позвоните: {biz?.phones?.[0]}</p>
    </main>
  );
}

function Msg({ text }: { text: string }) {
  return <main className="mx-auto max-w-[520px] px-4 py-10"><p>{text}</p></main>;
}
