'use client';
// Выбор нового времени при переносе (ТЗ §10.5). Слоты — публичный API (кэш, prefetch, AbortController,
// useTransition — lib/use-slots), перенос — POST /api/bookings/{token}/reschedule (lib/booking-client).
// slot_taken → выбранное время сбрасывается, список слотов перезагружается, диктору — «список обновлён».
// Ошибки too_late / reschedule_limit → текст + телефон бизнеса ссылкой tel:.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { dateBounds, dateOptions, firstOpenDate, isDateInBounds, resolveSchedule, type ClientSchedule } from '@/lib/booking-dates';
import { formatSlotDateTime } from '@/lib/slots';
import { REASON_MESSAGES } from '@/lib/schemas';
import type { ClientFailure } from '@/lib/booking-client';
import { useDelayedFlag, useSlots, PENDING_TEXT_DELAY_MS } from '@/lib/use-slots';
import { DateStrip, FieldError, SlotPicker } from '../../../booking-ui';
import { telHref } from '../../booking-page-ui';
import { useRescheduleSubmit, type RescheduleOutcome } from './use-reschedule-submit';

type Props = {
  token: string;
  serviceId: string;
  prefix: string;
  slug: string;
  schedule: ClientSchedule;
  currentStartsAt: string;
};

const LABEL = 'block text-[14px] font-medium mb-1';
const NO_TIME_MESSAGE = 'Выберите новое время';
const SAME_TIME_MESSAGE = 'Это текущее время записи. Выберите другое.';

function useIds() {
  const base = useId();
  return useMemo(
    () => ({
      dateLabel: `${base}-date-label`,
      timeLabel: `${base}-time-label`,
      timeError: `${base}-time-error`,
      time: `${base}-time`,
      status: `${base}-status`,
    }),
    [base],
  );
}

// Ошибка отправки (кроме slot_taken — она показывается у поля «Время»).
function failureOf(outcome: RescheduleOutcome): ClientFailure | null {
  if (outcome.kind !== 'failed' || outcome.failure.reason === 'slot_taken') return null;
  return outcome.failure;
}

// Текст без номера: телефон показывается рядом ссылкой tel: (reasonMessage дописал бы его второй раз).
function failureText(failure: ClientFailure | null): string {
  if (failure === null) return '';
  if (failure.reason === 'network') return failure.message;
  return REASON_MESSAGES[failure.reason];
}

export function RescheduleForm({ token, serviceId, prefix, slug, schedule, currentStartsAt }: Props) {
  const ids = useIds();
  const resolved = useMemo(() => resolveSchedule(schedule), [schedule]);
  const [nowMs] = useState(() => Date.now());
  const options = useMemo(() => dateOptions(resolved, nowMs), [resolved, nowMs]);
  const bounds = useMemo(() => dateBounds(resolved, nowMs), [resolved, nowMs]);
  const [date, setDate] = useState(() => firstOpenDate(options));
  const [picked, setPicked] = useState('');
  const [timeError, setTimeError] = useState<string | undefined>(undefined);
  const slots = useSlots({ prefix, slug }, serviceId, date);
  const { outcome, refreshCount, sending, submit } = useRescheduleSubmit({
    token,
    minHoursBefore: resolved.minHoursBefore,
    onSlotTaken: slots.reload,
  });

  // Смена даты сбрасывает выбранное время: оно из другого списка.
  const selectDate = useCallback((value: string) => {
    setDate(value);
    setPicked('');
    setTimeError(undefined);
  }, []);
  const onOtherDate = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      if (value === '' || isDateInBounds(value, bounds)) selectDate(value);
    },
    [bounds, selectDate],
  );
  // Выбор слота — синхронно, без сети: подсветка в том же кадре.
  const selectSlot = useCallback((iso: string) => {
    setPicked(iso);
    setTimeError(undefined);
  }, []);

  // slot_taken: сбросить выбор, показать ошибку у поля и вернуть фокус в список времени.
  const timeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (outcome.kind !== 'failed' || outcome.failure.reason !== 'slot_taken') return;
    setPicked('');
    setTimeError(outcome.failure.message);
    timeRef.current?.focus();
  }, [outcome]);

  const onSubmit = useCallback(() => {
    if (picked.length === 0) {
      setTimeError(NO_TIME_MESSAGE);
      timeRef.current?.focus();
      return;
    }
    if (Date.parse(picked) === Date.parse(currentStartsAt)) {
      setTimeError(SAME_TIME_MESSAGE);
      return;
    }
    submit(date, picked);
  }, [picked, currentStartsAt, submit, date]);

  if (outcome.kind === 'done') return <DonePanel startsAt={outcome.result.startsAt} timeZone={resolved.timeZone} />;
  const failure = failureOf(outcome);

  return (
    <div className="mt-6 grid gap-4">
      <fieldset className="m-0 border-0 p-0">
        <legend id={ids.dateLabel} className={LABEL}>Новая дата</legend>
        <DateStrip options={options} selected={date} onSelect={selectDate} onPrefetch={slots.prefetch} labelId={ids.dateLabel} />
        <label className="mt-2 flex items-center gap-2 text-[14px]">
          <span>Другая дата</span>
          <input type="date" className="input" min={bounds.min} max={bounds.max} value={date} onChange={onOtherDate} />
        </label>
      </fieldset>
      <fieldset className="m-0 border-0 p-0">
        <legend id={ids.timeLabel} className={LABEL}>Новое время</legend>
        <div id={ids.time} ref={timeRef} tabIndex={-1} className="outline-none">
          <SlotPicker
            state={slots.state}
            showSkeleton={slots.showSkeleton}
            selected={picked}
            timeZone={resolved.timeZone}
            onSelect={selectSlot}
            labelId={ids.timeLabel}
            errorId={ids.timeError}
            invalid={timeError !== undefined}
            emptyText="На эту дату свободного времени нет. Выберите другой день."
          />
        </div>
        <FieldError id={ids.timeError} message={timeError} />
        {/* Счётчик обновлений: каждый slot_taken меняет текст — диктор озвучит его даже при повторе. */}
        <p role="status" aria-live="polite" className="sr-only">
          {refreshCount > 0 ? `Список времени обновлён (${refreshCount})` : ''}
        </p>
      </fieldset>
      <p id={ids.status} role="alert" aria-live="assertive" className="m-0 text-[14px] text-[#b91c1c]">
        {failureText(failure)}{' '}
        {failure?.phone ? <a href={telHref(failure.phone)} className="underline">{failure.phone}</a> : null}
      </p>
      <SubmitButton sending={sending} onClick={onSubmit} describedBy={ids.status} />
    </div>
  );
}

function SubmitButton({ sending, onClick, describedBy }: { sending: boolean; onClick: () => void; describedBy: string }) {
  const showText = useDelayedFlag(sending, PENDING_TEXT_DELAY_MS);
  return (
    <button type="button" className="btn-primary min-h-[44px]" disabled={sending} aria-busy={sending} aria-describedby={describedBy} onClick={onClick}>
      {showText ? 'Переносим…' : 'Перенести'}
    </button>
  );
}

function DonePanel({ startsAt, timeZone }: { startsAt: string; timeZone: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Форма исчезла — фокус на результат.
  useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="mt-6 rounded-xl bg-[#f5f5f5] p-4 outline-none">
      <p className="m-0 font-semibold">Запись перенесена</p>
      <p className="m-0 mt-1">Новое время: <time dateTime={startsAt}>{formatSlotDateTime(startsAt, timeZone)}</time></p>
    </div>
  );
}
