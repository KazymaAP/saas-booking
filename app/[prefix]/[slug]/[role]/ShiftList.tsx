'use client';
// app/[prefix]/[slug]/[role]/ShiftList.tsx — записи смены с быстрой сменой статуса одним нажатием.
// Клиентский: статус меняется сразу (useOptimistic), при ошибке откатывается и показывается строка ошибки.
// Вёрстка — карточки, а не таблица: сотрудник открывает страницу с телефона в зале.
import { useCallback, useMemo, useOptimistic, useState, useTransition } from 'react';
import type { BookingStatus } from '@/lib/database.types';
import { callAction } from '../admin/(protected)/_lib/client-action';
import { changeBookingStatus } from '../admin/(protected)/bookings/actions';
import { telHref } from '../admin/(protected)/bookings/tel';
import { ACTION_LABEL, STATUS_LABEL, TRANSITIONS, availableActions, type BookingAction } from '../admin/(protected)/bookings/status';
import { isOpenShiftRow, type ShiftRow } from './shift';

type Patch = { id: string; status: BookingStatus };

function applyPatch(rows: readonly ShiftRow[], patch: Patch): ShiftRow[] {
  return rows.map((row) => (row.id === patch.id ? { ...row, status: patch.status } : row));
}

// Кнопки одной записи. Подтверждение — акцентное, отметки визита — обычные, отмена — последняя и с подтверждением.
const ORDER: readonly BookingAction[] = ['confirm', 'done', 'no_show', 'cancel'];

export function ShiftList({ slug, rows, now, canWrite }: {
  slug: string;
  rows: readonly ShiftRow[];
  now: number;
  canWrite: boolean;
}) {
  const [optimisticRows, setOptimistic] = useOptimistic(rows, applyPatch);
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const open = useMemo(() => optimisticRows.filter(isOpenShiftRow), [optimisticRows]);
  const closed = useMemo(() => optimisticRows.filter((row) => !isOpenShiftRow(row)), [optimisticRows]);

  const run = useCallback(async (row: ShiftRow, action: BookingAction) => {
    if (busyId) return; // второй тап по любой карточке, пока идёт запрос, игнорируем
    // Отмена необратима и уведомляет клиента — спрашиваем подтверждение (design-spec §6).
    if (action === 'cancel' && !window.confirm(`Отменить запись?\n${row.client_name ?? 'Клиент'}, ${row.time}`)) return;
    setError(null);
    setBusyId(row.id);
    startTransition(async () => {
      setOptimistic({ id: row.id, status: TRANSITIONS[action].to });
      const res = await callAction(() => changeBookingStatus(slug, { id: row.id, action }));
      setBusyId(null);
      if (res.ok) {
        setAnnounce(`${row.client_name ?? 'Запись'} ${row.time}: ${STATUS_LABEL[TRANSITIONS[action].to]}`);
      } else {
        // Откат происходит сам: transition завершился, а props rows не изменились.
        setError(res.error);
        setAnnounce(`Ошибка: ${res.error}`);
      }
    });
  }, [busyId, slug]);

  if (optimisticRows.length === 0) {
    return (
      <p className="box-border rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 text-[14px] text-[var(--muted)]">
        На сегодня записей нет. Новые появятся здесь автоматически.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {/* aria-live: подтверждение смены статуса для скринридера — без визуального toast. */}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {error && (
        <p className="box-border !mb-0 rounded-[var(--radius)] border border-[#f0c2c2] bg-[#fdf3f3] px-3 py-2 text-[13px] text-[#a12a2a]" role="alert">
          {error}
        </p>
      )}

      <ul className="grid list-none gap-2 !p-0">
        {open.map((row) => (
          <ShiftCard key={row.id} row={row} now={now} busy={busyId === row.id} canWrite={canWrite} onAction={run} />
        ))}
      </ul>

      {closed.length > 0 && (
        <section className="grid gap-2">
          <h2 className="!mb-0 text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">Закрытые за день</h2>
          <ul className="grid list-none gap-2 !p-0">
            {closed.map((row) => (
              <ShiftCard key={row.id} row={row} now={now} busy={busyId === row.id} canWrite={canWrite} onAction={run} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ShiftCard({ row, now, busy, canWrite, onAction }: {
  row: ShiftRow;
  now: number;
  busy: boolean;
  canWrite: boolean;
  onAction: (row: ShiftRow, action: BookingAction) => void;
}) {
  const started = row.starts_at <= now;
  const actions = canWrite ? ORDER.filter((a) => availableActions(row.status, started).includes(a)) : [];
  const tel = row.client_phone ? telHref(row.client_phone) : null;

  return (
    <li className="box-border rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3.5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-[17px] font-semibold tabular-nums leading-6">{row.time}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="block text-[15px] font-semibold leading-5">{row.service}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${statusClass(row.status)}`}>
              {STATUS_LABEL[row.status]}
            </span>
          </span>
          <span className="mt-1 block text-[13px] leading-5 text-[var(--muted)]">
            {row.client_name ?? 'Клиент не указан'}
            {tel && (
              <>
                {' · '}
                <a href={tel} className="font-medium text-[var(--brand-color)] !no-underline">{row.client_phone}</a>
              </>
            )}
          </span>
          {row.comment && <span className="mt-1 block text-[13px] leading-5 text-[var(--muted)]">«{row.comment}»</span>}
        </span>
      </div>

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => onAction(row, action)}
              className={`box-border min-h-[44px] appearance-none rounded-md border px-3 text-[13px] font-medium disabled:opacity-50 ${buttonClass(action)}`}
            >
              {ACTION_LABEL[action]}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

// Статус — цветом и текстом: одного цвета мало (дальтонизм), поэтому подпись всегда рядом.
function statusClass(status: BookingStatus): string {
  if (status === 'new') return 'bg-[#fff6e5] text-[#8a5a00]';
  if (status === 'confirmed') return 'bg-[#eef4ff] text-[#1f4b99]';
  if (status === 'done') return 'bg-[#eef7ee] text-[#2a6b2a]';
  if (status === 'no_show') return 'bg-[#f4f4f4] text-[#595959]';
  return 'bg-[#fdf3f3] text-[#a12a2a]';
}

function buttonClass(action: BookingAction): string {
  if (action === 'confirm') return 'border-[var(--brand-color)] bg-[var(--brand-color)] text-white';
  if (action === 'cancel') return 'border-[#f0c2c2] text-[#a12a2a]';
  return 'border-[var(--line)] text-[var(--ink)]';
}
