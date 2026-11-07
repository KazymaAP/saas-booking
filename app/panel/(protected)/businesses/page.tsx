// app/panel/(protected)/businesses/page.tsx — список бизнесов: фильтры, пагинация, массовая смена статуса,
// импорт 2GIS, экспорт CSV/XLSX, ручное добавление (ТЗ §13.1).
// Фильтры и страница — в searchParams: ссылки пагинации и экспорта сохраняют все фильтры (раньше терялись city и q).
import { adminClient } from '@/lib/supabase';
import { BulkTable, type BulkAction, type BulkRow } from '@/главная/components/BulkTable';
import { Pager } from '@/главная/components/Pager';
import { BUSINESS_STATUSES, MASS_STATUSES, STATUS_LABEL } from '@/главная/lib/statuses';
import { applyBusinessFilters, readBusinessFilters, type BusinessFilters } from '@/главная/lib/business-filters';
import { withParams, type Params } from '@/главная/lib/url';
import { massSetStatus } from './actions';
import { ImportForm } from './ImportForm';
import { AddBusinessForm } from './AddBusinessForm';

export const dynamic = 'force-dynamic';

const PAGE = 50;

const MASS_ACTION: BulkAction[] = [
  {
    key: 'status',
    label: 'Применить',
    run: massSetStatus,
    optimistic: 'status',
    options: MASS_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
    optionLabel: 'Сменить статус на…',
  },
];

type Row = { id: string; name: string; city: string | null; status: string; custom_domain: string | null; subscription_until: string | null };

async function loadPage(f: BusinessFilters) {
  const db = adminClient();
  const from = (f.page - 1) * PAGE;
  // Фильтры до .range(): count — по отфильтрованной выборке.
  const q = applyBusinessFilters(db.from('businesses').select('id, name, city, status, custom_domain, subscription_until', { count: 'exact' }), f);
  const [list, verticals] = await Promise.all([
    q.order('created_at', { ascending: false }).range(from, from + PAGE - 1).returns<Row[]>(),
    db.from('vertical_templates').select('id, name').order('name').returns<{ id: string; name: string }[]>(),
  ]);
  const rows: BulkRow[] = (list.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    status: r.status,
    extra: [r.custom_domain, r.subscription_until ? `до ${r.subscription_until}` : null].filter(Boolean).join(' · ') || null,
  }));
  return { rows, total: list.count ?? 0, verticals: verticals.data ?? [], failed: Boolean(list.error) };
}

export default async function BusinessesPage({ searchParams }: { searchParams: Params }) {
  const f = readBusinessFilters(searchParams);
  const { rows, total, verticals, failed } = await loadPage(f);
  // Экспорт получает те же фильтры, что и список (без номера страницы — выгружается вся выборка).
  const exportHref = (format: 'csv' | 'xlsx') => `/api/export/businesses${withParams(searchParams, { page: undefined, format })}`;

  return (
    <div className="grid gap-10">
      <section aria-labelledby="biz-list">
        <h1 id="biz-list">Бизнесы</h1>
        <Filters f={f} verticals={verticals} />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[14px]">
          {/* При сбое «Найдено: 0» не показываем: это выглядело бы как пустая база рядом с сообщением об ошибке. */}
          {!failed && <p className="m-0 text-[#666666]" role="status">Найдено: {total.toLocaleString('ru-RU')}</p>}
          <a className="underline" href={exportHref('csv')} download>Скачать CSV</a>
          <a className="underline" href={exportHref('xlsx')} download>Скачать XLSX</a>
        </div>
        {failed && <p role="alert" className="text-[14px] text-[#dc2626]">Не удалось загрузить список. Обновите страницу.</p>}
        {!failed && (
          <>
            <div className="mt-3">
              <BulkTable caption="Бизнесы" rows={rows} columns={['city', 'status', 'extra']} extraLabel="Домен / оплачено до" actions={MASS_ACTION} empty="По фильтру ничего не найдено." />
            </div>
            <Pager params={searchParams} page={f.page} pageSize={PAGE} total={total} shown={rows.length} />
          </>
        )}
      </section>

      <section aria-labelledby="biz-import">
        <h2 id="biz-import">Импорт выгрузки 2GIS</h2>
        <ImportForm />
      </section>

      <section aria-labelledby="biz-add">
        <h2 id="biz-add">Добавить вручную</h2>
        <AddBusinessForm />
      </section>
    </div>
  );
}

// GET-форма фильтров: работает без JS, сбрасывает страницу на первую.
function Filters({ f, verticals }: { f: BusinessFilters; verticals: { id: string; name: string }[] }) {
  return (
    <form className="mt-2 flex flex-wrap items-end gap-2 text-[14px]" method="get" aria-label="Фильтр бизнесов">
      <label className="grid gap-1" htmlFor="biz-status">
        Статус
        <select id="biz-status" name="status" defaultValue={f.status} className="input max-w-[220px]">
          <option value="">Все статусы</option>
          {BUSINESS_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="grid gap-1" htmlFor="biz-vertical">
        Ниша
        <select id="biz-vertical" name="vertical" defaultValue={f.vertical} className="input max-w-[200px]">
          <option value="">Все ниши</option>
          {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1" htmlFor="biz-city">
        Город
        <input id="biz-city" name="city" defaultValue={f.city} className="input max-w-[180px]" autoComplete="address-level2" />
      </label>
      <label className="grid gap-1" htmlFor="biz-q">
        Название
        <input id="biz-q" name="q" type="search" defaultValue={f.q} className="input max-w-[260px]" />
      </label>
      <button className="btn-primary" type="submit">Найти</button>
      {(f.status || f.city || f.q || f.vertical) && <a className="min-h-[44px] leading-[44px] underline" href="?">Сбросить</a>}
    </form>
  );
}
