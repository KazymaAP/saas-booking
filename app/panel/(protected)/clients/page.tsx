// app/panel/(protected)/clients/page.tsx — клиенты (ТЗ §13.5, §14.2–14.4).
// Таблица: бизнес, купил, тариф, оплачено до, статус + кнопки. Фильтр и страница — в searchParams.
// Server Component: одна выборка страницы + тарифы параллельно; действия — ClientsTable (optimistic).
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { Pager } from '../_components/Pager';
import { one, pageNumber, searchTerm, withParams, type Params } from '../_lib/url';
import { ClientsTable } from './ClientsTable';
import { CANDIDATE_STATUSES, DAY_MS, isoDate, type ClientRow } from './schema';

export const dynamic = 'force-dynamic';

const PAGE = 50;
// «Скоро заканчивается»: ТЗ §14.3 — первое напоминание за 3 дня до конца.
const EXPIRING_DAYS = 3;

const VIEWS = {
  clients: 'Клиенты',
  expiring: 'Скоро продление',
  disabled: 'Отключены',
  candidates: 'Кандидаты',
} as const;
type View = keyof typeof VIEWS;

function readView(sp: Params): View {
  const v = one(sp.view);
  return v && v in VIEWS ? (v as View) : 'clients';
}

const COLS = 'id, name, status, paid_initial_at, plan_type, subscription_price, subscription_active, subscription_until, custom_domain, code_transferred_at, support_until, emails';
type DbRow = Omit<ClientRow, 'has_email'> & { emails: string[] | null };

async function loadPage(view: View, q: string, page: number) {
  const db = adminClient();
  const from = (page - 1) * PAGE;
  let query = db.from('businesses').select(COLS, { count: 'exact' });
  if (view === 'candidates') query = query.in('status', [...CANDIDATE_STATUSES]);
  else query = query.eq('status', 'client');
  if (view === 'expiring') query = query.eq('subscription_active', true).lte('subscription_until', isoDate(new Date(Date.now() + EXPIRING_DAYS * DAY_MS)));
  if (view === 'disabled') query = query.eq('subscription_active', false);
  if (q) query = query.ilike('name', `%${q}%`);
  // Клиентов — по сроку оплаты (ближайшие сверху), кандидатов — по свежести.
  query = view === 'candidates' ? query.order('created_at', { ascending: false }) : query.order('subscription_until', { ascending: true, nullsFirst: true });
  const [list, tariffs] = await Promise.all([
    query.range(from, from + PAGE - 1).returns<DbRow[]>(),
    db.from('settings').select('value').eq('key', 'tariffs').maybeSingle<{ value: Record<string, { name?: string; price?: number }> | null }>(),
  ]);
  // Email на клиент не отдаём — только признак (кнопка «Напомнить»). ПД не уходят в RSC-payload.
  const rows: ClientRow[] = (list.data ?? []).map(({ emails, ...r }) => ({ ...r, has_email: (emails?.length ?? 0) > 0 }));
  // №22: тарифы с ценами — нужны для выбора плана при отметке оплаты.
  const plans: Record<string, { name: string; price: number }> = {};
  for (const [k, v] of Object.entries(tariffs.data?.value ?? {})) {
    if (v && typeof v.price === 'number' && v.price > 0) plans[k] = { name: v.name ?? k, price: v.price };
  }
  return { rows, total: list.count ?? 0, plans, failed: Boolean(list.error) };
}

export default async function ClientsPage({ searchParams }: { searchParams: Params }) {
  const view = readView(searchParams);
  const q = searchTerm(searchParams.q);
  const page = pageNumber(searchParams.page);
  const { rows, total, plans, failed } = await loadPage(view, q, page);

  return (
    <div className="grid gap-4">
      <h1 className="m-0">Клиенты</h1>
      <nav aria-label="Выборка клиентов" className="flex flex-wrap gap-3 text-[14px]">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={withParams(searchParams, { view: v === 'clients' ? undefined : v, page: undefined })} aria-current={v === view ? 'page' : undefined} className={v === view ? 'font-semibold underline' : 'text-[#444444] underline'}>
            {VIEWS[v]}
          </Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-2 text-[14px]" aria-label="Поиск клиента">
        {view !== 'clients' && <input type="hidden" name="view" value={view} />}
        <label htmlFor="clients-q" className="grid gap-1">
          Название
          <input id="clients-q" name="q" type="search" defaultValue={q} className="input max-w-[260px]" />
        </label>
        <button type="submit" className="btn-primary">Найти</button>
      </form>
      {/* Сбой — только сообщение: «Найдено: 0» и пустая таблица выглядели бы как «клиентов нет». */}
      {failed ? (
        <p role="alert" className="text-[14px] text-[#dc2626]">Не удалось загрузить список. Обновите страницу.</p>
      ) : (
        <>
          <p role="status" className="m-0 text-[14px] text-[#666666]">Найдено: {total.toLocaleString('ru-RU')}</p>
          <ClientsTable rows={rows} plans={plans} />
          <Pager params={searchParams} page={page} pageSize={PAGE} total={total} shown={rows.length} label="Страницы клиентов" />
        </>
      )}
    </div>
  );
}
