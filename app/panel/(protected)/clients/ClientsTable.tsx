'use client';
// Таблица клиентов (ТЗ §13.5): кнопки действий с optimistic-обновлением строки и откатом при ошибке.
// ▸ Нажатие → строка сразу показывает новое состояние (до 30 дней, «отключена», «код передан»),
//   кнопки строки блокируются, результат — тост. ok=false → React откатывает optimistic-состояние сам.
// ▸ Опасные действия (отключить, отказ, передать код) — через ConfirmDialog.
// ▸ На < 768px — карточки вместо таблицы (ТЗ §13.11).
import { useCallback, useOptimistic, useState, useTransition } from 'react';
import { useToast } from '../_components/Toast';
import { ConfirmDialog } from '../_components/ConfirmDialog';
import { PrefetchLink } from '../_components/PrefetchLink';
import { StatusBadge } from '../_components/StatusBadge';
import { clientAction } from './actions';
import { orNetworkError } from '../_lib/network';
import { AccessForm } from './AccessForm';
import { OP_CONFIRM, OP_LABEL, allowedOps, predictPatch, type ClientOp, type ClientPatch, type ClientRow } from './schema';

type Change = { id: string; patch: ClientPatch };

function applyChange(rows: ClientRow[], c: Change): ClientRow[] {
  if (c.patch.removed) return rows.filter((r) => r.id !== c.id);
  return rows.map((r) => (r.id === c.id ? { ...r, ...c.patch } : r));
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : '—');

function planText(r: ClientRow, plans: Record<string, string>): string {
  if (!r.plan_type) return '—';
  const name = plans[r.plan_type] ?? r.plan_type;
  return r.subscription_price ? `${name}, ${Number(r.subscription_price).toLocaleString('ru-RU')} ₽/мес` : name;
}

function subscriptionText(r: ClientRow): string {
  if (r.status !== 'client') return '—';
  return `${fmtDate(r.subscription_until)}${r.subscription_active ? '' : ' · отключена'}`;
}

type Pending = { row: ClientRow; op: ClientOp } | null;

// Опасные операции (OP_CONFIRM) — через диалог подтверждения, остальные сразу.
function useAsk(run: (row: ClientRow, op: ClientOp) => void) {
  const [asking, setAsking] = useState<Pending>(null);
  const request = useCallback(
    (row: ClientRow, op: ClientOp) => {
      if (OP_CONFIRM[op]) setAsking({ row, op });
      else run(row, op);
    },
    [run],
  );
  const confirm = useCallback(() => {
    if (asking) run(asking.row, asking.op);
    setAsking(null);
  }, [asking, run]);
  const cancel = useCallback(() => setAsking(null), []);
  return { asking, request, confirm, cancel };
}

export function ClientsTable({ rows, plans }: { rows: ClientRow[]; plans: Record<string, string> }) {
  const toast = useToast();
  const [view, change] = useOptimistic(rows, applyChange);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  const run = useCallback(
    (row: ClientRow, op: ClientOp) => {
      start(async () => {
        change({ id: row.id, patch: predictPatch(op, row) });
        setBusyId(row.id);
        // Отказ сети — тост и снятие «занятости»; откат optimistic-патча делает сам useOptimistic.
        const res = await orNetworkError(clientAction(row.id, op));
        setBusyId(null);
        toast.show(res.ok ? res.message : res.error, res.ok ? 'success' : 'error');
      });
    },
    [change, toast],
  );

  const { asking, request, confirm, cancel } = useAsk(run);

  if (view.length === 0) return <p role="status" className="text-[14px] text-[#666666]">По фильтру клиентов нет.</p>;

  return (
    <>
      <DesktopTable rows={view} plans={plans} busyId={busyId} onRun={request} />
      <MobileList rows={view} plans={plans} busyId={busyId} onRun={request} />
      <ConfirmDialog
        open={asking !== null}
        title={asking ? `${OP_LABEL[asking.op]}: ${asking.row.name}?` : ''}
        text={asking ? OP_CONFIRM[asking.op] ?? '' : ''}
        confirmLabel={asking ? OP_LABEL[asking.op] : 'Да'}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </>
  );
}

type ListProps = { rows: ClientRow[]; plans: Record<string, string>; busyId: string | null; onRun: (row: ClientRow, op: ClientOp) => void };

function DesktopTable({ rows, plans, busyId, onRun }: ListProps) {
  return (
    <table className="hidden md:table">
      <caption className="sr-only">Клиенты и кандидаты в клиенты</caption>
      <thead>
        <tr>
          <th scope="col">Бизнес</th>
          <th scope="col">Статус</th>
          <th scope="col">Купил</th>
          <th scope="col">Тариф</th>
          <th scope="col">Оплачено до</th>
          <th scope="col">Код</th>
          <th scope="col">Действия</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} aria-busy={busyId === r.id} className="align-top">
            <th scope="row" className="font-normal"><NameCell row={r} /></th>
            <td><StatusBadge status={r.status} pending={busyId === r.id} /></td>
            <td>{fmtDate(r.paid_initial_at)}</td>
            <td>{planText(r, plans)}</td>
            <td>{subscriptionText(r)}</td>
            <td>{r.code_transferred_at ? `передан, поддержка до ${fmtDate(r.support_until)}` : '—'}</td>
            <td><RowActions row={r} busy={busyId === r.id} onRun={onRun} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Карточки вместо таблицы < 768px (ТЗ §13.11).
function MobileList({ rows, plans, busyId, onRun }: ListProps) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 md:hidden" aria-label="Клиенты">
      {rows.map((r) => (
        <li key={r.id} aria-busy={busyId === r.id} className="grid gap-1 rounded-[12px] border border-[#e5e5e5] bg-white p-3 text-[14px]">
          <NameCell row={r} />
          <StatusBadge status={r.status} pending={busyId === r.id} />
          <span>Тариф: {planText(r, plans)}</span>
          <span>Оплачено до: {subscriptionText(r)}</span>
          {r.code_transferred_at && <span>Код передан, поддержка до {fmtDate(r.support_until)}</span>}
          <RowActions row={r} busy={busyId === r.id} onRun={onRun} />
        </li>
      ))}
    </ul>
  );
}

function NameCell({ row }: { row: ClientRow }) {
  return (
    <span className="grid">
      <PrefetchLink className="underline" href={`/panel/businesses/${row.id}`}>{row.name}</PrefetchLink>
      {row.custom_domain && <span className="text-[12px] text-[#666666]">{row.custom_domain}</span>}
    </span>
  );
}

function RowActions({ row, busy, onRun }: { row: ClientRow; busy: boolean; onRun: (row: ClientRow, op: ClientOp) => void }) {
  const ops = allowedOps(row);
  return (
    <div className="flex flex-wrap items-start gap-2">
      {ops.map((op) => <OpButton key={op} row={row} op={op} busy={busy} onRun={onRun} />)}
      {row.status === 'client' && (
        <a className="inline-flex min-h-[44px] items-center underline md:min-h-0" href={`/api/transfer/${row.id}`} download aria-label={`Скачать код «${row.name}» (ZIP)`}>
          Скачать код
        </a>
      )}
      {row.status === 'client' && <AccessForm id={row.id} name={row.name} />}
    </div>
  );
}

const DANGER = '!border-[#dc2626] !text-[#dc2626]';
const OP_CLASS: Partial<Record<ClientOp, string>> = { paid: 'btn-primary', disable: DANGER, refuse: DANGER };

function OpButton({ row, op, busy, onRun }: { row: ClientRow; op: ClientOp; busy: boolean; onRun: (row: ClientRow, op: ClientOp) => void }) {
  const click = useCallback(() => onRun(row, op), [onRun, row, op]);
  return (
    <button type="button" onClick={click} disabled={busy} aria-disabled={busy} aria-label={`${OP_LABEL[op]}: ${row.name}`} className={OP_CLASS[op] ?? ''}>
      {OP_LABEL[op]}
    </button>
  );
}
