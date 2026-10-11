// app/[prefix]/[slug]/panel/(protected)/page.tsx — дашборд и онбординг (ТЗ §5.3, §31).
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function OwnerHome({ params }: { params: { prefix: string; slug: string } }) {
  const access = (await currentOwner(params.slug))!;
  const b = access.business;
  const db = adminClient();

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekAhead = new Date(Date.now() + 7 * 86_400_000);
  const [{ count: today }, { count: upcoming }, { count: services }, { count: photos }] = await Promise.all([
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', b.id).in('status', ['new', 'confirmed']).gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', new Date(dayStart.getTime() + 86_400_000).toISOString()),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', b.id).in('status', ['new', 'confirmed']).gte('scheduled_at', new Date().toISOString()).lt('scheduled_at', weekAhead.toISOString()),
    db.from('services').select('id', { count: 'exact', head: true }).eq('business_id', b.id),
    db.from('photos').select('id', { count: 'exact', head: true }).eq('business_id', b.id),
  ]);

  const checklist = [
    { done: (services ?? 0) > 0, label: 'Услуги и цены', href: `/${params.prefix}/${params.slug}/panel/services` },
    { done: (photos ?? 0) > 0, label: 'Фото работ', href: `/${params.prefix}/${params.slug}/panel/photos` },
    { done: Boolean(b.address && b.phones?.length), label: 'Контакты и адрес', href: `/${params.prefix}/${params.slug}/panel/settings` },
    { done: Boolean(b.working_hours), label: 'Рабочее время', href: `/${params.prefix}/${params.slug}/panel/settings` },
  ];
  const done = checklist.filter((c) => c.done).length;
  const percent = Math.round((done / checklist.length) * 100);

  return (
    <div className="grid gap-8">
      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-[#e5e5e5] p-4"><div className="text-[14px] text-[#666666]">Записей сегодня</div><div className="text-[32px] font-bold">{today ?? 0}</div></div>
        <div className="rounded-md border border-[#e5e5e5] p-4"><div className="text-[14px] text-[#666666]">Записей на 7 дней</div><div className="text-[32px] font-bold">{upcoming ?? 0}</div></div>
      </section>

      {percent < 100 && (
        <section>
          <h2 className="text-[18px] font-semibold">Готовность сайта: {percent}%</h2>
          <div className="mt-2 h-2 w-full rounded bg-[#e5e5e5]"><div className="h-2 rounded" style={{ width: `${percent}%`, background: 'var(--brand-color)' }} /></div>
          <ul className="mt-4 grid gap-2 text-[14px]">
            {checklist.map((c) => (
              <li key={c.label}>
                {c.done ? '☑' : '☐'} <a className="underline" href={c.href}>{c.label}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
