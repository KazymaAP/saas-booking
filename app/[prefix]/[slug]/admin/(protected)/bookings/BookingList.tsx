'use client';
// bookings/BookingList.tsx — список броней с мгновенной сменой статуса (useOptimistic + useTransition).
// Клиентский, потому что кнопки меняют состояние до ответа сервера, а при ошибке — откат и toast.
// < 768px — карточки, ≥ 768px — таблица (ТЗ §13.11, design-spec §7.3).
import { useCallback, useDeferredValue, useId, useMemo, useOptimistic, useState, useTransition } from 'react';
import type { BookingStatus } from '@/lib/database.types';
import { useToast } from '../_components/Toast';
import { useConfirm } from '../_components/ConfirmDialog';
import { callAction } from '../_lib/client-action';
import { useBusyIds } from '../_lib/busy';
import { changeBookingStatus } from './actions';
import { telHref } from './tel';
import { groupByDay, matchesQuery, SEARCH_MIN_ROWS } from './view';
import { ACTION_LABEL, STATUS_LABEL, TRANSITIONS, availableActions, type BookingAction } from './status';

export type BookingRow = {
  id: string;
  when: string; // уже отформатировано на сервере в часовом поясе бизнеса
  starts_at: number; // начало записи, мс UTC: решает, показывать ли «Выполнено» / «Не пришёл»
  status: BookingStatus;
  client_name: string | null;
  client_phone: string | null;
  comment: string | null;
  service: string;
};

type Patch = { id: string; status: BookingStatus };

function applyPatch(rows: BookingRow[], patch: Patch): BookingRow[] {
  return rows.map((r) => (r.id === patch.id ? { ...r, status: patch.status } : r));
}

// groupHeading — уровень заголовков дней: в «Бронях» под h1 — h2, на дашборде под h2 «Ждут подтверждения» — h3.
export function BookingList({ slug, rows, emptyText, now, groupHeading: DayHeading = 'h2' }: {
  slug: string; rows: BookingRow[]; emptyText: string; now: number; groupHeading?: 'h2' | 'h3';
}) {
  const [optimisticRows, setOptimistic] = useOptimistic(rows, applyPatch);
  const [, startTransition] = useTransition();
  const busy = useBusyIds();
  const [announce, setAnnounce] = useState('');
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const [query, setQuery] = useState('');
  // Отложенное значение: ввод в поле не ждёт перерисовки длинного списка (до 200 строк).
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();

  const run = useCallback(async (row: BookingRow, action: BookingAction) => {
    // Повторный клик по строке, пока её запрос идёт, игнорируем (кнопки и так disabled — это страховка от двойного тапа).
    if (busy.isBusy(row.id)) return;
    // Отмена — необратима и уведомляет клиента (design-spec §6: опасные действия с подтверждением).
    if (action === 'cancel') {
      const yes = await confirm({ title: 'Отменить запись?', text: `${row.client_name ?? 'Клиент'}, ${row.when}`, confirmLabel: 'Отменить запись', danger: true });
      if (!yes) return;
    }
    busy.start(row.id);
    startTransition(async () => {
      setOptimistic({ id: row.id, status: TRANSITIONS[action].to });
      const res = await callAction(() => changeBookingStatus(slug, { id: row.id, action }));
      busy.stop(row.id);
      if (res.ok) {
        const text = res.message ?? 'Готово';
        toast.success(text);
        setAnnounce(`${row.client_name ?? 'Запись'}: ${STATUS_LABEL[TRANSITIONS[action].to]}`);
      } else {
        // Откат происходит сам: transition завершился, а props rows не изменились.
        toast.error(res.error);
        setAnnounce(`Ошибка: ${res.error}`);
      }
    });
  }, [busy, confirm, setOptimistic, slug, toast]);

  const filtered = useMemo(() => optimisticRows.filter((r) => matchesQuery(r, deferredQuery)), [optimisticRows, deferredQuery]);
  const groups = useMemo(() => groupByDay(filtered, now), [filtered, now]);
  const onQuery = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value), []);

  if (optimisticRows.length === 0) return <EmptyState text={emptyText} />;
  const searchable = rows.length >= SEARCH_MIN_ROWS;

  return (
    <>
      {/* Объявление для экранного диктора о смене статуса (ТЗ §19.6). */}
      <p className="sr-only" aria-live="polite">{announce}</p>
      {dialog}

      {searchable && (
        <div className="grid gap-1 text-[14px] sm:max-w-[360px]" role="search">
          <label htmlFor={searchId} className="font-medium">Поиск</label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={onQuery}
            placeholder="Имя, телефон или услуга"
            autoComplete="off"
            enterKeyHint="search"
            className="!min-h-[44px]"
          />
          {/* Число найденных — вежливо, чтобы диктор не перебивал ввод. */}
          <p className="sr-only" aria-live="polite">{deferredQuery.trim() ? `Найдено: ${filtered.length}` : ''}</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="!mb-0 rounded-xl border border-dashed border-[#d4d4d4] bg-[var(--surface)] p-6 text-center text-[14px]">По запросу «{deferredQuery.trim()}» ничего не найдено</p>
      ) : (
        <>
          {/* < 768px: карточки, сгруппированные по дням («Сегодня», «Завтра», …). */}
          <div className="grid gap-5 md:hidden">
            {groups.map((g) => (
              <section key={g.key} aria-label={g.title} className="grid gap-2">
                <DayHeading className="!mb-0 text-[15px] font-semibold text-[#333333]">{g.title} <span className="font-normal text-[#595959]">· {g.rows.length}</span></DayHeading>
                <ul className="grid gap-3">
                  {g.rows.map((row) => (
                    <li key={row.id} className="rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4 text-[14px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{row.when}</span>
                        <StatusBadge status={row.status} />
                      </div>
                      <p className="!mb-0 mt-1">{row.service}</p>
                      <p className="!mb-0">{row.client_name ?? 'Без имени'} · <PhoneLink phone={row.client_phone} /></p>
                      {row.comment && <p className="!mb-0 mt-1 text-[#595959]">{row.comment}</p>}
                      <Actions row={row} started={row.starts_at <= now} busy={busy.isBusy(row.id)} onRun={run} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* ≥ 768px: таблица, у каждого дня своя строка-заголовок (th scope=colgroup — диктор читает её у ячеек). */}
          <table className="hidden md:table">
            <caption className="sr-only">Список броней</caption>
            <thead>
              <tr><th scope="col">Когда</th><th scope="col">Услуга</th><th scope="col">Клиент</th><th scope="col">Статус</th><th scope="col"><span className="sr-only">Действия</span></th></tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                <tr>
                  <th scope="colgroup" colSpan={5} className="bg-[#fafafa] text-left text-[14px] font-semibold">
                    {g.title} <span className="font-normal text-[#595959]">· {g.rows.length}</span>
                  </th>
                </tr>
                {g.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap font-medium">{row.when}</td>
                    <td>{row.service}{row.comment && <span className="block text-[13px] text-[#595959]">{row.comment}</span>}</td>
                    <td>{row.client_name ?? 'Без имени'}<span className="block"><PhoneLink phone={row.client_phone} /></span></td>
                    <td><StatusBadge status={row.status} /></td>
                    <td><Actions row={row} started={row.starts_at <= now} busy={busy.isBusy(row.id)} onRun={run} compact /></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </>
      )}
    </>
  );
}

function Actions({ row, started, busy, onRun, compact = false }: { row: BookingRow; started: boolean; busy: boolean; onRun: (row: BookingRow, a: BookingAction) => void; compact?: boolean }) {
  const actions = availableActions(row.status, started);
  if (actions.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'justify-end' : 'mt-3'}`} aria-busy={busy}>
      {actions.map((a) => <ActionButton key={a} row={row} action={a} busy={busy} onRun={onRun} />)}
    </div>
  );
}

function ActionButton({ row, action, busy, onRun }: { row: BookingRow; action: BookingAction; busy: boolean; onRun: (row: BookingRow, a: BookingAction) => void }) {
  const onClick = useCallback(() => onRun(row, action), [onRun, row, action]);
  const primary = action === 'confirm';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={`${ACTION_LABEL[action]}: ${row.client_name ?? 'запись'}, ${row.when}`}
      className={`!min-h-[44px] md:!min-h-[36px] ${primary ? '!border-[var(--brand-color)] !bg-[var(--brand-color)] !text-white' : ''}`}
    >
      {ACTION_LABEL[action]}
    </button>
  );
}

// Цвет — не единственный признак: в бейдже всегда текст статуса (design-spec §9).
const BADGE: Record<BookingStatus, string> = {
  new: 'bg-[#fef9c3] text-[#713f12]',
  confirmed: 'bg-[#dcfce7] text-[#14532d]',
  done: 'bg-[#f0f0f0] text-[#333333]',
  no_show: 'bg-[#fee2e2] text-[#7f1d1d]',
  cancelled: 'bg-[#f0f0f0] text-[#595959] line-through',
};

function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium ${BADGE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-[#595959]">нет телефона</span>;
  const href = telHref(phone);
  // Кривой номер показываем текстом, а не битой ссылкой.
  if (!href) return <span>{phone}</span>;
  return <a className="inline-flex min-h-[24px] items-center underline" href={href}>{phone}</a>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[#d4d4d4] bg-[var(--surface)] p-8 text-center">
      <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.6"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      <p className="!mb-0 font-medium">{text}</p>
      <p className="!mb-0 text-[14px] text-[#595959]">Новые записи появятся здесь автоматически.</p>
    </div>
  );
}
