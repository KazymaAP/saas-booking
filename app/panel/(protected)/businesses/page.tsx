// app/panel/(protected)/businesses/page.tsx — список, фильтры, массовые операции, импорт и экспорт (ТЗ §5.4).
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { addBusiness, massSetStatus } from './actions';
import { ImportForm } from './ImportForm';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'in_progress', 'preview_ready', 'approved', 'sent', 'viewed', 'replied', 'client', 'refused', 'no_contact', 'archived'] as const;
const MASS = ['new', 'in_progress', 'approved', 'refused', 'no_contact', 'archived'] as const;
const PAGE = 50;

export default async function BusinessesPage({ searchParams }: { searchParams: { status?: string; q?: string; page?: string; city?: string } }) {
  const page = Math.max(1, Number(searchParams.page ?? 1));
  let query = adminClient()
    .from('businesses')
    .select('id, name, slug, city, status, custom_domain, subscription_until, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (searchParams.status && (STATUSES as readonly string[]).includes(searchParams.status)) query = query.eq('status', searchParams.status);
  if (searchParams.q) query = query.ilike('name', `%${searchParams.q.replace(/[%_]/g, '')}%`);
  if (searchParams.city) query = query.eq('city', searchParams.city);
  const { data: rows, count } = await query;
  const qs = `${searchParams.status ? `&status=${encodeURIComponent(searchParams.status)}` : ''}`;

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-[24px] font-semibold">Бизнесы</h1>
        <form className="mt-4 flex flex-wrap gap-2 text-[14px]" method="get">
          <select name="status" defaultValue={searchParams.status ?? ''} className="input max-w-[220px]">
            <option value="">Все статусы</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input name="city" defaultValue={searchParams.city ?? ''} placeholder="Город" className="input max-w-[180px]" />
          <input name="q" defaultValue={searchParams.q ?? ''} placeholder="Поиск по названию" className="input max-w-[260px]" />
          <button className="btn-primary" type="submit">Найти</button>
          <a className="h-11 rounded-md border border-[#e5e5e5] px-4 leading-[42px]" href={`/api/export/businesses?format=csv${qs}`}>CSV</a>
          <a className="h-11 rounded-md border border-[#e5e5e5] px-4 leading-[42px]" href={`/api/export/businesses?format=xlsx${qs}`}>XLSX</a>
        </form>
        <p className="mt-3 text-[14px] text-[#666666]">Всего: {count ?? 0}</p>

        <form action={massSetStatus} className="mt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead><tr className="border-b border-[#e5e5e5]"><th className="p-2"></th><th className="p-2">Название</th><th className="p-2">Город</th><th className="p-2">Статус</th><th className="p-2">Домен</th><th className="p-2">Оплачено до</th></tr></thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-[#e5e5e5]">
                    <td className="p-2"><input type="checkbox" name="ids" value={r.id} /></td>
                    <td className="p-2"><Link className="underline" href={`/panel/businesses/${r.id}`}>{r.name}</Link></td>
                    <td className="p-2">{r.city ?? '—'}</td>
                    <td className="p-2">{r.status}</td>
                    <td className="p-2">{r.custom_domain ?? '—'}</td>
                    <td className="p-2">{r.subscription_until ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px]">
            <span>Выбранным:</span>
            <select name="status" className="input max-w-[200px]" defaultValue="">
              <option value="" disabled>Сменить статус на…</option>
              {MASS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn-primary" type="submit">Применить</button>
          </div>
        </form>

        <div className="mt-4 flex gap-3 text-[14px]">
          {page > 1 && <Link className="underline" href={`?page=${page - 1}${qs}`}>← Назад</Link>}
          {(rows?.length ?? 0) === PAGE && <Link className="underline" href={`?page=${page + 1}${qs}`}>Дальше →</Link>}
        </div>
      </div>

      <section>
        <h2 className="text-[18px] font-semibold">Импорт выгрузки 2GIS</h2>
        <div className="mt-3"><ImportForm /></div>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Добавить вручную</h2>
        <form action={addBusiness} className="mt-3 grid max-w-[480px] gap-2 text-[14px]">
          <input name="name" placeholder="Название" className="input" required minLength={2} />
          <div className="grid grid-cols-2 gap-2">
            <input name="city" placeholder="Город" className="input" />
            <input name="phone" placeholder="Телефон" className="input" />
          </div>
          <input name="address" placeholder="Адрес" className="input" />
          <input name="email" type="email" placeholder="Email (если есть — статус new)" className="input" />
          <button className="btn-primary" type="submit">Добавить</button>
        </form>
      </section>
    </div>
  );
}
