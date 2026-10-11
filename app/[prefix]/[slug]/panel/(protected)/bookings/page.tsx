// app/[prefix]/[slug]/panel/(protected)/bookings/page.tsx — список броней на день/неделю (ТЗ §5.3).
import { adminClient } from '@/lib/supabase';
import { currentOwner } from '@/lib/owner-session';
import { changeBookingStatus } from './actions';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = { new: 'Новая', confirmed: 'Подтверждена', cancelled: 'Отменена', done: 'Выполнена', no_show: 'Не пришёл' };

export default async function BookingsPage({ params, searchParams }: { params: { prefix: string; slug: string }; searchParams: { filter?: string } }) {
  const access = (await currentOwner(params.slug))!;
  const filter = searchParams.filter === 'all' ? 'all' : 'upcoming';
  const from = new Date(Date.now() - (filter === 'all' ? 30 : 0) * 86_400_000).toISOString();

  let q = adminClient()
    .from('bookings')
    .select('id, scheduled_at, status, client_name, client_phone, comment, services(name)')
    .eq('business_id', access.business.id)
    .gte('scheduled_at', from)
    .order('scheduled_at', { ascending: true })
    .limit(200);
  if (filter === 'upcoming') q = q.in('status', ['new', 'confirmed']);
  const { data } = await q;

  const act = changeBookingStatus.bind(null, params.prefix, params.slug);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-semibold">Брони</h1>
        <div className="flex gap-3 text-[14px]">
          <a className={filter === 'upcoming' ? 'font-semibold underline' : 'underline'} href="?filter=upcoming">Предстоящие</a>
          <a className={filter === 'all' ? 'font-semibold underline' : 'underline'} href="?filter=all">Все за 30 дней</a>
        </div>
      </div>
      <ul className="mt-4 grid gap-3">
        {(data ?? []).map((b: any) => (
          <li key={b.id} className="rounded-md border border-[#e5e5e5] p-4 text-[14px]">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-medium">{new Date(b.scheduled_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</span>
              <span>{LABEL[b.status] ?? b.status}</span>
            </div>
            <div className="mt-1">{b.services?.name ?? 'Услуга'} · {b.client_name} · <a className="underline" href={`tel:${b.client_phone}`}>{b.client_phone}</a></div>
            {b.comment && <div className="mt-1 text-[#666666]">{b.comment}</div>}
            <div className="mt-3 flex flex-wrap gap-2">
              {b.status === 'new' && <Btn act={act} id={b.id} action="confirm" label="Подтвердить" primary />}
              {(b.status === 'new' || b.status === 'confirmed') && <Btn act={act} id={b.id} action="done" label="Выполнено" />}
              {(b.status === 'new' || b.status === 'confirmed') && <Btn act={act} id={b.id} action="no_show" label="Не пришёл" />}
              {(b.status === 'new' || b.status === 'confirmed') && <Btn act={act} id={b.id} action="cancel" label="Отменить" />}
            </div>
          </li>
        ))}
        {(data ?? []).length === 0 && <li className="text-[#666666]">Броней нет.</li>}
      </ul>
    </div>
  );
}

function Btn({ act, id, action, label, primary }: { act: (fd: FormData) => Promise<void>; id: string; action: string; label: string; primary?: boolean }) {
  return (
    <form action={act}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" className={primary ? 'btn-primary h-9 px-3' : 'h-9 rounded-md border border-[#e5e5e5] px-3'}>{label}</button>
    </form>
  );
}
