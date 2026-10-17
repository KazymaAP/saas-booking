'use client';
// Таблица с чекбоксами и массовыми операциями (воронка, бизнесы). Промт агента 7: optimistic по умолчанию.
// ▸ Чекбоксы — локальное состояние, отклик мгновенный.
// ▸ Действие сразу меняет строки через useOptimistic (убирает из шага или меняет статус).
// ▸ Сервер вернул ok=false → transition завершается без изменения базовых rows → React сам откатывает.
// ▸ Частичный успех → тост с отчётом, пропущенные строки возвращаются на место.
// ▸ На < 768px таблица превращается в карточки (ТЗ §13.11).
import { useCallback, useId, useMemo, useOptimistic, useState, useTransition } from 'react';
import type { BulkResult } from '../_lib/action';
import { MSG_NETWORK } from '../_lib/network';
import { useToast, type ToastKind } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { PrefetchLink } from './PrefetchLink';
import { StatusBadge } from './StatusBadge';

export type BulkRow = { id: string; name: string; city?: string | null; status?: string; preview_url?: string | null; extra?: string | null };

export type BulkColumn = 'city' | 'status' | 'preview' | 'extra' | 'edit';

export type BulkOption = { value: string; label: string };

export type BulkAction = {
  key: string;
  label: string;
  run: (ids: string[], option?: string) => Promise<BulkResult>;
  // Что делаем со строками до ответа сервера.
  optimistic: 'remove' | 'status';
  // Для optimistic='status' без options — фиксированный новый статус.
  status?: string;
  // Выпадающий список значения (массовая смена статуса).
  options?: BulkOption[];
  optionLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  confirm?: string;
};

type Props = {
  caption: string;
  rows: BulkRow[];
  columns: BulkColumn[];
  actions: BulkAction[];
  extraLabel?: string;
  linkToCard?: boolean;
  empty?: string;
};

type Patch = { ids: string[]; remove: boolean; status?: string };

function applyPatch(rows: BulkRow[], p: Patch): BulkRow[] {
  const set = new Set(p.ids);
  if (p.remove) return rows.filter((r) => !set.has(r.id));
  return rows.map((r) => (set.has(r.id) ? { ...r, status: p.status ?? r.status } : r));
}

// Полный успех — зелёный, частичный — нейтральный с отчётом, провал — красный.
function resultKind(res: BulkResult): ToastKind {
  if (!res.ok) return 'error';
  return res.skipped.length === 0 ? 'success' : 'info';
}

const VARIANT_CLASS: Record<NonNullable<BulkAction['variant']>, string> = {
  primary: 'btn-primary',
  secondary: '',
  danger: '!border-[#dc2626] !text-[#dc2626]',
};

const COLUMN_LABEL: Record<BulkColumn, string> = { city: 'Город', status: 'Статус', preview: 'Прототип', extra: '', edit: 'Правки' };

// Сеть/сервер не ответили — server action отклоняется. Отчёт «ничего не сделано»: строки возвращаются (откат
// useOptimistic), выбор сохраняется для повтора, тост объясняет причину.
function networkFailure(ids: string[]): BulkResult {
  return { ok: false, message: MSG_NETWORK, done: [], skipped: ids };
}

// Выбор строк: считается только среди видимых — после optimistic-удаления счётчик не врёт.
function useRowSelection(view: BulkRow[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const visibleSelected = useMemo(() => view.filter((r) => selected.has(r.id)).map((r) => r.id), [view, selected]);
  const allChecked = view.length > 0 && visibleSelected.length === view.length;
  const someChecked = visibleSelected.length > 0 && !allChecked;
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setSelected(allChecked ? new Set() : new Set(view.map((r) => r.id)));
  }, [allChecked, view]);
  return { selected, setSelected, visibleSelected, allChecked, someChecked, toggle, toggleAll };
}

// Действие с confirm сначала открывает диалог, без confirm — выполняется сразу.
function useConfirm(execute: (a: BulkAction) => void) {
  const [confirming, setConfirming] = useState<BulkAction | null>(null);
  const ask = useCallback(
    (action: BulkAction) => {
      if (action.confirm) setConfirming(action);
      else execute(action);
    },
    [execute],
  );
  const confirmNow = useCallback(() => {
    if (confirming) execute(confirming);
    setConfirming(null);
  }, [confirming, execute]);
  const cancelConfirm = useCallback(() => setConfirming(null), []);
  return { confirming, ask, confirmNow, cancelConfirm };
}

// Запуск массового действия: optimistic-патч → server action → отчёт тостом; сбой сети — откат и отчёт.
function useBulkRun(visibleSelected: string[], setSelected: (s: Set<string>) => void, patch: (p: Patch) => void) {
  const toast = useToast();
  const [options, setOptions] = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();

  const execute = useCallback(
    (action: BulkAction) => {
      const ids = visibleSelected;
      if (ids.length === 0) return;
      const option = action.options ? options[action.key] ?? '' : undefined;
      if (action.options && !option) {
        toast.show(`Выберите: ${action.optionLabel ?? 'значение'}`, 'error');
        return;
      }
      const nextStatus = action.optimistic === 'status' ? option ?? action.status : undefined;
      startTransition(async () => {
        patch({ ids, remove: action.optimistic === 'remove', status: nextStatus });
        setPendingIds(new Set(ids));
        const res = await action.run(ids, option).catch(() => networkFailure(ids));
        setPendingIds(new Set());
        // Снимаем выбор только с обработанных — пропущенные остаются выбранными для повтора.
        setSelected(new Set(res.skipped));
        toast.show(res.message, resultKind(res));
      });
    },
    [visibleSelected, setSelected, options, patch, toast],
  );
  return { options, setOptions, pendingIds, isPending, execute };
}

export function BulkTable({ caption, rows, columns, actions, extraLabel = '', linkToCard = true, empty = 'Пусто.' }: Props) {
  const uid = useId();
  const [view, patch] = useOptimistic(rows, applyPatch);
  const sel = useRowSelection(view);
  const { visibleSelected, setSelected } = sel;
  const { options, setOptions, pendingIds, isPending, execute } = useBulkRun(visibleSelected, setSelected, patch);
  const { confirming, ask, confirmNow, cancelConfirm } = useConfirm(execute);

  if (view.length === 0) return <p className="text-[14px] text-[#666666]" role="status">{empty}</p>;
  const list: ListProps = { uid, caption, rows: view, columns, extraLabel, linkToCard, selected: sel.selected, pendingIds, onToggle: sel.toggle };
  return (
    <div aria-busy={isPending}>
      <DesktopTable {...list} allChecked={sel.allChecked} someChecked={sel.someChecked} onToggleAll={sel.toggleAll} />
      <MobileCards {...list} />
      <ActionBar uid={uid} actions={actions} count={visibleSelected.length} total={view.length} busy={isPending} options={options} sel={sel} onOption={setOptions} onRun={ask} />
      <ConfirmDialog
        open={confirming !== null}
        title="Подтвердите действие"
        text={confirming ? `${confirming.confirm} Выбрано: ${visibleSelected.length}.` : ''}
        confirmLabel={confirming?.label ?? 'Да'}
        onConfirm={confirmNow}
        onCancel={cancelConfirm}
      />
    </div>
  );
}

type BarProps = {
  uid: string;
  actions: BulkAction[];
  count: number;
  total: number;
  busy: boolean;
  options: Record<string, string>;
  sel: { allChecked: boolean; someChecked: boolean; toggleAll: () => void };
  onOption: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onRun: (a: BulkAction) => void;
};

// Счётчик выбранных (aria-live) и кнопки массовых действий; на мобильных — ещё «Выбрать все».
function ActionBar({ uid, actions, count, total, busy, options, sel, onOption, onRun }: BarProps) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px]">
      <span className="md:hidden">
        <SelectAll id={`${uid}-all-m`} checked={sel.allChecked} indeterminate={sel.someChecked} onChange={sel.toggleAll} withText />
      </span>
      <span aria-live="polite" className="text-[#666666]">Выбрано: {count} из {total}</span>
      {actions.map((a) => (
        <ActionControl key={a.key} uid={uid} action={a} count={count} busy={busy} value={options[a.key] ?? ''} onOption={onOption} onRun={onRun} />
      ))}
    </div>
  );
}

type ListProps = {
  uid: string;
  caption: string;
  rows: BulkRow[];
  columns: BulkColumn[];
  extraLabel: string;
  linkToCard: boolean;
  selected: Set<string>;
  pendingIds: Set<string>;
  onToggle: (id: string) => void;
};

type TableProps = ListProps & { allChecked: boolean; someChecked: boolean; onToggleAll: () => void };

function DesktopTable({ uid, caption, rows, columns, extraLabel, linkToCard, selected, pendingIds, onToggle, allChecked, someChecked, onToggleAll }: TableProps) {
  return (
    <table className="hidden md:table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-[44px]">
            <SelectAll id={`${uid}-all`} checked={allChecked} indeterminate={someChecked} onChange={onToggleAll} />
          </th>
          <th scope="col">Название</th>
          {columns.map((c) => <th key={c} scope="col">{c === 'extra' ? extraLabel : COLUMN_LABEL[c]}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} aria-selected={selected.has(r.id)}>
            <td><RowCheck uid={uid} row={r} checked={selected.has(r.id)} onToggle={onToggle} /></td>
            <th scope="row" className="font-normal"><RowName row={r} link={linkToCard} /></th>
            {columns.map((c) => <td key={c}><Cell row={r} column={c} pending={pendingIds.has(r.id)} /></td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Карточки вместо таблицы < 768px (ТЗ §13.11).
function MobileCards({ uid, caption, rows, columns, linkToCard, selected, pendingIds, onToggle }: ListProps) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 md:hidden" aria-label={caption}>
      {rows.map((r) => (
        <li key={r.id} className="rounded-[12px] border border-[#e5e5e5] bg-white p-3 text-[14px]">
          <div className="flex items-start gap-3">
            <RowCheck uid={`${uid}-m`} row={r} checked={selected.has(r.id)} onToggle={onToggle} />
            <div className="grid flex-1 gap-1">
              <RowName row={r} link={linkToCard} />
              {columns.map((c) => <Cell key={c} row={r} column={c} pending={pendingIds.has(r.id)} />)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SelectAll({ id, checked, indeterminate, onChange, withText = false }: { id: string; checked: boolean; indeterminate: boolean; onChange: () => void; withText?: boolean }) {
  // indeterminate есть только у DOM-свойства, не у атрибута.
  const setRef = useCallback((el: HTMLInputElement | null) => {
    if (el) el.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label htmlFor={id} className="inline-flex min-h-[44px] items-center gap-2">
      <input ref={setRef} id={id} type="checkbox" checked={checked} onChange={onChange} aria-label={withText ? undefined : 'Выбрать все строки'} className="h-5 w-5" />
      {withText && <span>Выбрать все</span>}
    </label>
  );
}

function RowCheck({ uid, row, checked, onToggle }: { uid: string; row: BulkRow; checked: boolean; onToggle: (id: string) => void }) {
  const change = useCallback(() => onToggle(row.id), [onToggle, row.id]);
  return (
    <label htmlFor={`${uid}-${row.id}`} className="inline-flex min-h-[44px] min-w-[32px] items-center">
      <input id={`${uid}-${row.id}`} type="checkbox" checked={checked} onChange={change} aria-label={`Выбрать «${row.name}»`} className="h-5 w-5" />
    </label>
  );
}

function RowName({ row, link }: { row: BulkRow; link: boolean }) {
  if (!link) return <span>{row.name}</span>;
  return <PrefetchLink className="underline" href={`/panel/businesses/${row.id}`}>{row.name}</PrefetchLink>;
}

function Cell({ row, column, pending }: { row: BulkRow; column: BulkColumn; pending: boolean }) {
  if (column === 'city') return <span>{row.city || '—'}</span>;
  if (column === 'status') return row.status ? <StatusBadge status={row.status} pending={pending} /> : <span>—</span>;
  if (column === 'extra') return <span className="text-[#666666]">{row.extra || '—'}</span>;
  if (column === 'edit') return <PrefetchLink className="underline" href={`/panel/businesses/${row.id}`} aria-label={`Правки: ${row.name}`}>Правки</PrefetchLink>;
  return row.preview_url ? (
    <a className="underline" href={row.preview_url} target="_blank" rel="noreferrer noopener" aria-label={`Открыть прототип «${row.name}» в новой вкладке`}>Открыть</a>
  ) : (
    <span>—</span>
  );
}

type ControlProps = {
  uid: string;
  action: BulkAction;
  count: number;
  busy: boolean;
  value: string;
  onOption: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onRun: (a: BulkAction) => void;
};

function ActionControl({ uid, action, count, busy, value, onOption, onRun }: ControlProps) {
  const run = useCallback(() => onRun(action), [onRun, action]);
  const pick = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      onOption((prev) => ({ ...prev, [action.key]: v }));
    },
    [onOption, action.key],
  );
  const cls = VARIANT_CLASS[action.variant ?? 'primary'];
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {action.options && (
        <>
          <label htmlFor={`${uid}-${action.key}`} className="sr-only">{action.optionLabel ?? 'Значение'}</label>
          <select id={`${uid}-${action.key}`} value={value} onChange={pick} className="input max-w-[220px]">
            <option value="" disabled>{action.optionLabel ?? 'Выберите…'}</option>
            {action.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </>
      )}
      <button type="button" className={cls} onClick={run} disabled={busy || count === 0} aria-disabled={busy || count === 0}>
        {action.label}{count > 0 ? ` (${count})` : ''}
      </button>
    </span>
  );
}
