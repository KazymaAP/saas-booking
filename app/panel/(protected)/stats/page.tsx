// app/panel/(protected)/stats/page.tsx — статистика (ТЗ §13.8): MRR, конверсия sent → paid, воронка, города, ниши,
// каналы, дни, шаблоны. Данные — снимок из кэша (stats/compute.ts, TTL 15 минут), пересчёт — кнопкой.
// Таблицы с <caption> и scope, числа выровнены вправо; столбики по дням — с текстовой подписью (не только цвет/длина).
import Link from 'next/link';
import { one, withParams, type Params } from '../_lib/url';
import { PERIODS, getStats, type Period } from './compute';
import type { Count, DayStat, TemplateStat } from './aggregate';
import { RefreshButton } from './RefreshButton';

export const dynamic = 'force-dynamic';

const DEFAULT_PERIOD: Period = 30;

function readPeriod(sp: Params): Period {
  const n = Number(one(sp.period));
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : DEFAULT_PERIOD;
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const int = (n: number) => n.toLocaleString('ru-RU');
const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 1000) / 10}%` : '—');

export default async function StatsPage({ searchParams }: { searchParams: Params }) {
  const period = readPeriod(searchParams);
  const { snapshot: s, cached } = await getStats(period);
  const t = s.totals;
  const at = new Date(s.computed_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0">Статистика</h1>
        <div className="flex flex-wrap items-center gap-3 text-[14px]">
          <nav aria-label="Период" className="flex gap-3">
            {PERIODS.map((p) => (
              <Link key={p} href={withParams(searchParams, { period: p === DEFAULT_PERIOD ? undefined : p })} aria-current={p === period ? 'page' : undefined} className={p === period ? 'font-semibold underline' : 'text-[#444444] underline'}>
                {p} дней
              </Link>
            ))}
          </nav>
          <span className="text-[#666666]">Данные на {at}{cached ? ' (кэш)' : ''}</span>
          <RefreshButton period={period} />
        </div>
      </header>

      <section aria-labelledby="stats-kpi">
        <h2 id="stats-kpi" className="sr-only">Главные показатели</h2>
        <dl className="m-0 grid grid-cols-2 gap-3 text-[14px] md:grid-cols-4">
          <Kpi label="MRR" value={rub(t.mrr)} hint="Сумма активных подписок" />
          <Kpi label="Клиентов" value={int(t.clients)} hint={`из ${int(t.businesses)} бизнесов`} />
          <Kpi label={`Писем за ${period} дн.`} value={int(t.sent)} hint="уникальных бизнесов" />
          <Kpi label="Конверсия sent → paid" value={`${t.conversion}%`} hint={t.per_payment ? `1 оплата на ${t.per_payment} писем` : 'оплат пока нет'} />
        </dl>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <CountTable id="stats-funnel" title="Воронка по статусам" rows={s.funnel} total={t.businesses} />
        <CountTable id="stats-verticals" title="Ниши" rows={s.verticals} total={t.businesses} />
        <CountTable id="stats-cities" title={`Города (топ ${s.cities.length})`} rows={s.cities} total={t.businesses} />
        <CountTable id="stats-channels" title={`Каналы рассылки за ${period} дн.`} rows={s.channels} />
      </div>
      <TemplatesTable rows={s.templates} period={period} />
      <DaysTable rows={s.days} />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[12px] border border-[#e5e5e5] bg-white p-3">
      <dt className="text-[#666666]">{label}</dt>
      <dd className="m-0 text-[20px] font-bold">{value}</dd>
      {hint && <dd className="m-0 text-[12px] text-[#666666]">{hint}</dd>}
    </div>
  );
}

function CountTable({ id, title, rows, total }: { id: string; title: string; rows: Count[]; total?: number }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[14px] text-[#666666]">Нет данных.</p>
      ) : (
        <table className="w-full text-[14px]">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr><th scope="col">Значение</th><th scope="col" className="text-right">Количество</th>{total !== undefined && <th scope="col" className="text-right">Доля</th>}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="font-normal">{r.label}</th>
                <td className="text-right tabular-nums">{int(r.value)}</td>
                {total !== undefined && <td className="text-right tabular-nums text-[#666666]">{pct(r.value, total)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TemplatesTable({ rows, period }: { rows: TemplateStat[]; period: number }) {
  return (
    <section aria-labelledby="stats-templates" className="overflow-x-auto">
      <h2 id="stats-templates">Шаблоны писем за {period} дн.</h2>
      {rows.length === 0 ? (
        <p className="text-[14px] text-[#666666]">Писем за период не было.</p>
      ) : (
        <table className="w-full text-[14px]">
          <caption className="sr-only">Эффективность шаблонов писем</caption>
          <thead>
            <tr>
              <th scope="col">Шаблон</th>
              <th scope="col" className="text-right">Отправлено</th>
              <th scope="col" className="text-right">Открыто</th>
              <th scope="col" className="text-right">Клик</th>
              <th scope="col" className="text-right">Ответили</th>
              <th scope="col" className="text-right">Оплатили</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="font-normal">{r.label}</th>
                <td className="text-right tabular-nums">{int(r.sent)}</td>
                <td className="text-right tabular-nums">{int(r.opened)} <span className="text-[#666666]">({pct(r.opened, r.sent)})</span></td>
                <td className="text-right tabular-nums">{int(r.clicked)} <span className="text-[#666666]">({pct(r.clicked, r.sent)})</span></td>
                <td className="text-right tabular-nums">{int(r.replied)}</td>
                <td className="text-right tabular-nums">{int(r.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DaysTable({ rows }: { rows: DayStat[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sent));
  return (
    <section aria-labelledby="stats-days">
      <h2 id="stats-days">По дням ({rows.length} последних)</h2>
      <table className="w-full max-w-[720px] text-[14px]">
        <caption className="sr-only">Отправлено писем и оплат по дням</caption>
        <thead>
          <tr><th scope="col">День</th><th scope="col">Отправлено</th><th scope="col" className="text-right">Оплат</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <th scope="row" className="whitespace-nowrap font-normal">{new Date(`${r.day}T00:00:00Z`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', weekday: 'short', timeZone: 'UTC' })}</th>
              <td>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-2 rounded-full bg-[#111111]" style={{ width: `${Math.round((r.sent / max) * 100)}%`, minWidth: r.sent ? 4 : 0, maxWidth: 240 }} />
                  <span className="tabular-nums">{int(r.sent)}</span>
                </span>
              </td>
              <td className="text-right tabular-nums">{int(r.paid)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
