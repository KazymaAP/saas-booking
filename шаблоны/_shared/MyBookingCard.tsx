'use client';
// шаблоны/_shared/MyBookingCard.tsx — карточка «Моя запись» в стиле эталона D:\Clode\Детейленг.
// Работает только по токену из ссылки/localStorage: никакого аккаунта и входа не требуется.
import { useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { CalendarPlus, MagnifyingGlass, Trash } from '@phosphor-icons/react';
import { cancelAction } from '../../app/[prefix]/[slug]/booking/cancel/[token]/actions';
import { IDLE_STATE, type ActionState } from '@/lib/booking-action-state-types';
import type { MyBookingView } from '@/lib/booking-view';

const STATUS_RU: Record<string, string> = {
  new: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  in_progress: 'Выполняется',
  done: 'Завершена',
  cancelled: 'Отменена',
  no_show: 'Не приехал',
};

const STATUS_TONE: Record<string, string> = {
  new: 'border-brand-warning/30 bg-brand-warning/10 text-brand-warning',
  confirmed: 'border-brand-accent/30 bg-brand-accent/10 text-brand-accent',
  in_progress: 'border-brand-accent/30 bg-brand-accent/10 text-brand-accent',
  done: 'border-brand-success/30 bg-brand-success/10 text-brand-success',
  cancelled: 'border-brand-error/30 bg-brand-error/10 text-brand-error',
  no_show: 'border-brand-error/30 bg-brand-error/10 text-brand-error',
};

function money(value: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-destructive w-full text-body-sm" disabled={pending} aria-busy={pending}>
      <Trash size={18} weight="bold" /> {pending ? 'Отменяем…' : 'Да, отменить'}
    </button>
  );
}

function CancelResult({ state }: { state: ActionState }) {
  const ref = useRef<HTMLDivElement>(null);
  if (state.kind === 'idle') return null;
  return (
    <div ref={ref} role={state.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className="mt-4 rounded-xl border border-brand-border bg-brand-surface p-4 text-body-sm">
      {state.kind === 'done' ? (
        <p className="m-0">{state.already ? 'Запись уже отменена.' : 'Запись отменена.'}</p>
      ) : (
        <p className="m-0 text-brand-error">{state.message}</p>
      )}
    </div>
  );
}

export function MyBookingCard({ view, base }: { view: MyBookingView | null; base: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useFormState(cancelAction, IDLE_STATE);

  if (!view) {
    return (
      <>
        <h1 className="text-heading-lg">Моя запись</h1>
        <div className="card-premium mt-4 p-5 text-center">
          <MagnifyingGlass size={32} weight="bold" className="mx-auto text-brand-text-muted" />
          <p className="mt-3 text-heading-sm">Запись не найдена</p>
          <p className="mt-2 text-body-sm text-brand-text-muted">
            Возможно, ссылка устарела или запись была удалена. Запишитесь заново — это займёт минуту.
          </p>
          <a href={`${base}?book=1`} className="btn-primary mt-5 w-full text-body-sm">Записаться</a>
        </div>
        <a href={base} className="btn-ghost mt-4 text-body-sm">На главную</a>
      </>
    );
  }

  const cancelled = view.status === 'cancelled' || state.kind === 'done';
  const cancellable = view.cancellable && !cancelled;

  function downloadCalendar() {
    if (!view) return;
    const text = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//zapishisya.ru//My booking//RU',
      'BEGIN:VEVENT',
      `UID:${view.token}@zapishisya.ru`,
      `DTSTAMP:${icsDate(new Date().toISOString())}`,
      `DTSTART:${icsDate(view.startsAt)}`,
      `DTEND:${icsDate(view.endsAt)}`,
      `SUMMARY:${escapeIcs(`${view.serviceName ?? 'Услуга'} — ${view.businessName}`)}`,
      `LOCATION:${escapeIcs(view.address)}`,
      `DESCRIPTION:${escapeIcs(`${view.clientName} ${view.clientPhone}`.trim())}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `booking-${view.token}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 className="text-heading-lg">Моя запись</h1>
      <div className="card-premium mt-4 p-5 animate-fade-in-up">
        <div className="flex items-center justify-between gap-3">
          <span className="text-heading-sm">{view.serviceName ?? 'Услуга'}</span>
          <span className={`badge ${STATUS_TONE[view.status] ?? 'border-brand-border bg-brand-surface text-brand-text-muted'}`}>
            {cancelled ? 'Отменена' : (STATUS_RU[view.status] ?? view.status)}
          </span>
        </div>

        <dl className="mt-4 space-y-2 text-body-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-brand-text-muted">Когда</dt>
            <dd className="m-0 text-right">{view.when}</dd>
          </div>
          {view.clientName && (
            <div className="flex justify-between gap-4">
              <dt className="text-brand-text-muted">Имя</dt>
              <dd className="m-0 text-right">{view.clientName}</dd>
            </div>
          )}
          {view.clientPhone && (
            <div className="flex justify-between gap-4">
              <dt className="text-brand-text-muted">Телефон</dt>
              <dd className="m-0 text-right">{view.clientPhone}</dd>
            </div>
          )}
          {view.clientTelegram && (
            <div className="flex justify-between gap-4">
              <dt className="text-brand-text-muted">Telegram</dt>
              <dd className="m-0 text-right">{view.clientTelegram}</dd>
            </div>
          )}
          {view.address && (
            <div className="flex justify-between gap-4">
              <dt className="text-brand-text-muted">Где</dt>
              <dd className="m-0 text-right">{view.address}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-brand-text-muted">Стоимость</dt>
            <dd className="m-0 text-right">{money(view.price)}</dd>
          </div>
        </dl>

        {view.comment && (
          <p className="mt-4 rounded-xl border border-brand-border p-3 text-body-sm text-brand-text-muted">
            {view.comment}
          </p>
        )}

        {view.active && !cancelled && (
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={downloadCalendar} className="btn-secondary w-full text-body-sm">
              <CalendarPlus size={18} weight="bold" /> В календарь (.ics)
            </button>
            {view.phone && (
              <a href={`tel:${view.phone.replace(/[^\d+]/g, '')}`} className="btn-secondary w-full text-center text-body-sm">
                Позвонить в студию
              </a>
            )}
          </div>
        )}

        {cancellable && (
          <div className="mt-5">
            {confirming ? (
              <div role="group" aria-label="Подтверждение отмены" className="rounded-xl border border-brand-border p-4">
                <p className="m-0 text-body-sm">Отменить запись на {view.when}? Действие нельзя отменить.</p>
                <form action={formAction} className="mt-4 flex flex-col gap-2">
                  <input type="hidden" name="token" value={view.token} />
                  <CancelButton />
                  <button type="button" onClick={() => setConfirming(false)} className="btn-ghost w-full text-body-sm">
                    Оставить запись
                  </button>
                </form>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="btn-destructive w-full text-body-sm">
                <Trash size={18} weight="bold" /> Отменить запись
              </button>
            )}
            <p className="mt-2 text-caption text-brand-text-subtle">
              Отмена бесплатна за {view.cancelHours} ч до начала.
            </p>
          </div>
        )}

        {cancelled && (
          <p role="status" className="mt-4 text-body-sm text-brand-text-muted">
            Запись отменена. Свяжитесь со студией, если нужно перенести визит.
          </p>
        )}

        <CancelResult state={state} />
      </div>
      <a href={base} className="btn-ghost mt-4 text-body-sm">На главную</a>
    </>
  );
}
