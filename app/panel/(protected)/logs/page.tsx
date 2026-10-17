// app/panel/(protected)/logs/page.tsx — журнал: вкладки «Ошибки» и «Аудит» (ТЗ §13.7).
// Server Component. Вкладка, фильтры и страница — в searchParams: ссылки сохраняют фильтры, работают без JS.
// Права проверяет layout; данные — только чтение. Ровно 50 записей на странице (query.ts).
// Ссылка «Весь журнал по бизнесу» из карточки ведёт сюда с tab=audit&entity_id=<id>.
import Link from 'next/link';
import { LOG_SOURCES } from '@/lib/log';
import { PrefetchLink } from '../_components/PrefetchLink';
import { Pager } from '../_components/Pager';
import { ACTION_LABEL, ENTITY_LABEL, SOURCE_LABEL, actionLabel, auditDetails, isLogSource } from '../_lib/audit-labels';
import type { Params } from '../_lib/url';
import { hasFilters, readLogFilters, type LogFilters, type LogTab } from './filters';
import { LOG_PAGE, loadLogs, type LogRow } from './query';

export const dynamic = 'force-dynamic';

const TABS: { key: LogTab; label: string }[] = [
  { key: 'errors', label: 'Ошибки' },
  { key: 'audit', label: 'Аудит' },
];

const fmtTime = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'medium' });

export default async function LogsPage({ searchParams }: { searchParams: Params }) {
  const f = readLogFilters(searchParams);
  const { rows, hasNext, failed } = await loadLogs(f);
  const caption = f.tab === 'errors' ? 'Ошибки' : 'Аудит действий';

  return (
    <div className="grid gap-4 text-[14px]">
      <h1 className="text-[24px] font-semibold">Логи</h1>
      <nav aria-label="Вкладки журнала" className="flex gap-1 border-b border-[#e5e5e5]">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`?tab=${t.key}`}
            aria-current={f.tab === t.key ? 'page' : undefined}
            className={`min-h-[44px] px-3 leading-[44px] ${f.tab === t.key ? 'border-b-2 border-[#111111] font-semibold' : 'text-[#666666]'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <Filters f={f} />
      {/* Сбой — только сообщение: «Записей нет» рядом с ошибкой читалось бы как «ошибок не было». */}
      {failed && <p role="alert" className="text-[#dc2626]">Не удалось загрузить журнал. Обновите страницу.</p>}
      {!failed && <p role="status" className="m-0 text-[#666666]">
        {rows.length ? `Записи ${(f.page - 1) * LOG_PAGE + 1}–${(f.page - 1) * LOG_PAGE + rows.length}` : 'Записей нет'}
        {hasFilters(f) ? ' (по фильтру)' : ''}
      </p>}

      {rows.length > 0 && (
        <>
          <LogTable rows={rows} tab={f.tab} caption={caption} />
          <LogCards rows={rows} tab={f.tab} />
        </>
      )}
      {!failed && <Pager params={searchParams} page={f.page} pageSize={LOG_PAGE} total={null} shown={rows.length} hasNext={hasNext} label="Страницы журнала" />}
    </div>
  );
}

// GET-форма фильтров: без JS, сбрасывает страницу. Вкладка передаётся скрытым полем.
function Filters({ f }: { f: LogFilters }) {
  return (
    <form method="get" aria-label="Фильтр журнала" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="tab" value={f.tab} />
      {f.tab === 'errors' ? <ErrorFilters f={f} /> : <AuditFilters f={f} />}
      <label className="grid gap-1" htmlFor="log-from">
        С даты
        <input id="log-from" name="from" type="date" defaultValue={f.from} className="input" />
      </label>
      <label className="grid gap-1" htmlFor="log-to">
        По дату
        <input id="log-to" name="to" type="date" defaultValue={f.to} className="input" />
      </label>
      <button type="submit" className="btn-primary">Показать</button>
      {hasFilters(f) && <Link className="min-h-[44px] leading-[44px] underline" href={`?tab=${f.tab}`}>Сбросить</Link>}
      {f.entity_id && <p className="w-full text-[12px] text-[#666666]">Только записи объекта {f.entity_id.slice(0, 8)}…</p>}
    </form>
  );
}

function ErrorFilters({ f }: { f: LogFilters }) {
  return (
    <>
      <label className="grid gap-1" htmlFor="log-source">
        Источник
        <select id="log-source" name="source" defaultValue={f.source} className="input max-w-[200px]">
          <option value="">Все источники</option>
          {LOG_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="grid gap-1" htmlFor="log-q">
        Текст ошибки
        <input id="log-q" name="q" type="search" defaultValue={f.q} className="input max-w-[240px]" />
      </label>
    </>
  );
}

function AuditFilters({ f }: { f: LogFilters }) {
  return (
    <>
      <label className="grid gap-1" htmlFor="log-action">
        Действие
        <select id="log-action" name="action" defaultValue={f.action} className="input max-w-[240px]">
          <option value="">Все действия</option>
          {Object.entries(ACTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="grid gap-1" htmlFor="log-entity">
        Объект
        <select id="log-entity" name="entity" defaultValue={f.entity} className="input max-w-[180px]">
          <option value="">Все объекты</option>
          {Object.entries(ENTITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {f.entity_id && <input type="hidden" name="entity_id" value={f.entity_id} />}
    </>
  );
}

// Колонка «Что»: подпись источника/действия.
function what(r: LogRow, tab: LogTab): string {
  if (tab === 'audit') return actionLabel(r.action);
  return isLogSource(r.entity) ? SOURCE_LABEL[r.entity] : r.action;
}

// Текст события: для ошибки — сообщение, для аудита — краткие детали.
function summary(r: LogRow, tab: LogTab): string {
  if (tab === 'errors') return typeof r.payload?.message === 'string' ? r.payload.message : '';
  return auditDetails(r.action, r.payload);
}

// Ссылка на объект: бизнес открывается в карточке (prefetch при наведении), остальное — тип + короткий id.
function EntityRef({ r }: { r: LogRow }) {
  if (!r.entity_id) return <span className="text-[#999999]">—</span>;
  const label = `${ENTITY_LABEL[r.entity ?? ''] ?? r.entity ?? ''} ${r.entity_id.slice(0, 8)}`;
  if (r.entity === 'business') return <PrefetchLink className="underline" href={`/panel/businesses/${r.entity_id}`}>{label}</PrefetchLink>;
  return <span>{label}</span>;
}

// Полный payload — по запросу (раскрывающийся блок), уже замаскированный.
function Payload({ p }: { p: Record<string, unknown> | null }) {
  if (!p || Object.keys(p).length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[12px] text-[#666666]">Данные</summary>
      <pre className="mt-1 max-h-[240px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-[#f7f7f7] p-2 text-[12px]">{JSON.stringify(p, null, 2)}</pre>
    </details>
  );
}

function LogTable({ rows, tab, caption }: { rows: LogRow[]; tab: LogTab; caption: string }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[#e5e5e5]">
            <th scope="col" className="p-2">Время (МСК)</th>
            <th scope="col" className="p-2">{tab === 'errors' ? 'Источник' : 'Действие'}</th>
            <th scope="col" className="p-2">Объект</th>
            <th scope="col" className="p-2">{tab === 'errors' ? 'Сообщение' : 'Детали'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[#e5e5e5] align-top">
              <td className="whitespace-nowrap p-2"><time dateTime={r.created_at}>{fmtTime(r.created_at)}</time></td>
              <td className="p-2">{what(r, tab)}</td>
              <td className="whitespace-nowrap p-2"><EntityRef r={r} /></td>
              <td className="break-words p-2">
                {summary(r, tab)}
                <Payload p={r.payload} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Карточки вместо таблицы на < 768px (ТЗ §13.11).
function LogCards({ rows, tab }: { rows: LogRow[]; tab: LogTab }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 md:hidden">
      {rows.map((r) => (
        <li key={r.id} className="rounded-md border border-[#e5e5e5] p-3">
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{what(r, tab)}</strong>
            <time dateTime={r.created_at} className="text-[12px] text-[#666666]">{fmtTime(r.created_at)}</time>
          </div>
          <div className="mt-1 text-[13px]"><EntityRef r={r} /></div>
          <p className="m-0 mt-1 break-words">{summary(r, tab)}</p>
          <Payload p={r.payload} />
        </li>
      ))}
    </ul>
  );
}

