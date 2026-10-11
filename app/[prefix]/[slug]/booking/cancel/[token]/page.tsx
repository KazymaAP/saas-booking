// app/[prefix]/[slug]/booking/cancel/[token]/page.tsx — отмена по ссылке из письма (ТЗ §37).
import { adminClient } from '@/lib/supabase';
import { cancelByToken } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function CancelPage({ params }: { params: { prefix: string; slug: string; token: string } }) {
  const { data: b } = await adminClient()
    .from('bookings')
    .select('status, scheduled_at, services(name), businesses(name, phones, cancel_hours_before)')
    .eq('cancel_token', params.token).maybeSingle();

  if (!b) return <Msg text="Запись не найдена." />;
  const biz = (b as any).businesses;
  const when = new Date(b.scheduled_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  if (b.status === 'cancelled') return <Msg text={`Запись на ${when} уже отменена.`} />;
  if (b.status !== 'new' && b.status !== 'confirmed') return <Msg text="Эту запись нельзя отменить онлайн." />;

  const act = cancelByToken.bind(null, params.prefix, params.slug, params.token);
  return (
    <main className="mx-auto max-w-[480px] px-4 py-10">
      <h1 className="text-[24px] font-semibold">Отмена записи</h1>
      <p className="mt-3">{(b as any).services?.name} · {biz?.name} · {when}</p>
      <form action={act} className="mt-6">
        <button type="submit" className="btn-primary">Отменить запись</button>
      </form>
      <p className="mt-4 text-[14px] text-[#666666]">Отмена возможна не позднее чем за {biz?.cancel_hours_before} ч. Если времени мало, позвоните: {biz?.phones?.[0]}</p>
    </main>
  );
}

function Msg({ text }: { text: string }) {
  return <main className="mx-auto max-w-[480px] px-4 py-10"><p>{text}</p></main>;
}
