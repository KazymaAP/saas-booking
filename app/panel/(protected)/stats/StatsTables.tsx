// app/panel/(protected)/stats/StatsTables.tsx — презентационные блоки дашборда статистики (Server Components).
// a11y (ТЗ §19.6, design-spec §9): у каждой таблицы <caption>, заголовки <th scope>, числа выровнены вправо,
// секции связаны с заголовками через aria-labelledby, пустые данные озвучиваются текстом, а не пустой таблицей.
import type { ReactNode } from 'react';

const NUMBER = new Intl.NumberFormat('ru-RU');

export function formatNumber(n: number): string {
  return NUMBER.format(n);
}

export function formatPercent(n: number): string {
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

const DATE_TIME = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${DATE_TIME.format(d)} МСК`;
}

function sectionId(title: string): string {
  return `stats-${title.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

export function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-[#e5e5e5] p-3" role="group" aria-label={label}>
      <dt className="text-[#6b6b6b]">{label}</dt>
      <dd className="text-[20px] font-bold tabular-nums">{value}</dd>
      {hint && <dd className="text-[12px] text-[#6b6b6b]">{hint}</dd>}
    </div>
  );
}

export function KpiGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-[14px] md:grid-cols-4" aria-label={label}>
      {children}
    </dl>
  );
}

export type Column = { key: string; label: string; numeric?: boolean };
export type Row = { id: string; cells: Record<string, ReactNode> };

export function DataTable({ title, columns, rows, empty = 'Нет данных за период' }: {
  title: string;
  columns: Column[];
  rows: Row[];
  empty?: string;
}) {
  const id = sectionId(title);
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-[18px] font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-[14px] text-[#6b6b6b]">{empty}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full max-w-[720px] text-left text-[14px]">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-[#e5e5e5]">
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={`p-2 font-medium ${c.numeric ? 'text-right' : ''}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#e5e5e5]">
                  {columns.map((c, i) => (i === 0
                    ? <th key={c.key} scope="row" className="p-2 font-normal">{r.cells[c.key]}</th>
                    : <td key={c.key} className={`p-2 ${c.numeric ? 'text-right tabular-nums' : ''}`}>{r.cells[c.key]}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Простая таблица «ключ — значение» (города, ниши, каналы).
export function KeyValueTable({ title, keyLabel, valueLabel, items, empty }: {
  title: string;
  keyLabel: string;
  valueLabel: string;
  items: { key: string; value: number }[];
  empty?: string;
}) {
  return (
    <DataTable
      title={title}
      empty={empty}
      columns={[{ key: 'k', label: keyLabel }, { key: 'v', label: valueLabel, numeric: true }]}
      rows={items.map((it) => ({ id: it.key, cells: { k: it.key, v: formatNumber(it.value) } }))}
    />
  );
}

const PERCENT_MAX = 100;

// Полоса доли: декоративная (aria-hidden), значение озвучивается текстом рядом — цвет не единственный признак.
function ShareBar({ share }: { share: number }) {
  const width = Math.max(0, Math.min(PERCENT_MAX, share));
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span aria-hidden="true" className="hidden h-2 w-24 overflow-hidden rounded-sm bg-[#f0f0f0] sm:inline-block">
        <span className="block h-full bg-[#111111]" style={{ width: `${width}%` }} />
      </span>
      <span>{formatPercent(share)}</span>
    </span>
  );
}

// Воронка: доля от первого шага + полоса (цвет — не единственный признак, design-spec §9).
export function FunnelTable({ title, steps }: { title: string; steps: { key: string; label: string; value: number }[] }) {
  const base = steps[0]?.value ?? 0;
  return (
    <DataTable
      title={title}
      columns={[
        { key: 'step', label: 'Этап' },
        { key: 'count', label: 'Количество', numeric: true },
        { key: 'share', label: 'От первого этапа', numeric: true },
      ]}
      rows={steps.map((s) => ({
        id: s.key,
        cells: { step: s.label, count: formatNumber(s.value), share: base > 0 ? <ShareBar share={(s.value / base) * PERCENT_MAX} /> : '—' },
      }))}
    />
  );
}

// Выбор периода: обычная GET-форма без JS (работает и с отключённым JS, Enter отправляет — ТЗ §19.6).
// Подписи связаны с полями через htmlFor, подсказка про исключающую границу — через aria-describedby.
export function PeriodForm({ from, to, groupBy }: { from: string; to: string; groupBy: string }) {
  const field = 'mt-1 block rounded-md border border-[#d4d4d4] px-2 py-2 text-[14px] min-h-[44px]';
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 text-[14px]" aria-label="Период отчёта">
      <label htmlFor="stats-from">С
        <input id="stats-from" name="from" type="date" defaultValue={from} required className={field} />
      </label>
      <label htmlFor="stats-to">По
        <input id="stats-to" name="to" type="date" defaultValue={to} required aria-describedby="stats-to-hint" className={field} />
      </label>
      <label htmlFor="stats-group">Группировка
        <select id="stats-group" name="group_by" defaultValue={groupBy} className={field}>
          <option value="day">по дням</option>
          <option value="week">по неделям</option>
          <option value="month">по месяцам</option>
        </select>
      </label>
      <button type="submit" className="min-h-[44px] rounded-md border border-[#111111] px-4 font-medium">Показать</button>
      <p id="stats-to-hint" className="w-full text-[12px] text-[#6b6b6b]">Дата «по» не включается в отчёт. Максимум — 366 дней.</p>
    </form>
  );
}
