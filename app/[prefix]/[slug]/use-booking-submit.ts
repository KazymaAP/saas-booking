'use client';
// Отправка формы брони: useOptimistic (мгновенный отклик «Записываем…» и откат при ошибке) + useTransition.
// Ошибки сервера раскладываются по полям ({ fields } → setError), фокус уходит на первое невалидное поле.
import { useCallback, useOptimistic, useState, useTransition } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { browserBookingClient, type ClientFailure } from '@/lib/booking-client';
import { BOOKING_FIELD_ORDER, PRIVACY_VERSION, firstErrorField, type BookingCreated, type BookingField, type BookingFormValues } from '@/lib/schemas';

const HOUR_MS = 3_600_000;
const SLOT_GONE_MESSAGE = 'Это время уже недоступно. Выберите другое.';

export type SubmitPhase = 'idle' | 'sending';
export type SubmitOutcome = { kind: 'none' } | { kind: 'done'; booking: BookingCreated } | { kind: 'failed'; failure: ClientFailure };

type Options = {
  form: UseFormReturn<BookingFormValues>;
  site: { prefix: string; slug: string };
  minHoursBefore: number;
  focusField: (field: BookingField) => void;
  onSlotTaken: () => void;
};

// Ошибки полей из ответа сервера → rhf. Возвращает первое по порядку формы поле с ошибкой.
function applyFieldErrors(form: UseFormReturn<BookingFormValues>, failure: ClientFailure): BookingField | undefined {
  const fields = failure.fields ?? (failure.field ? { [failure.field]: [failure.message] } : undefined);
  if (fields === undefined) return undefined;
  for (const name of BOOKING_FIELD_ORDER) {
    const message = fields[name]?.[0];
    if (message) form.setError(name, { type: 'server', message });
  }
  return firstErrorField(fields);
}

export function useBookingSubmit({ form, site, minHoursBefore, focusField, onSlotTaken }: Options) {
  const [outcome, setOutcome] = useState<SubmitOutcome>({ kind: 'none' });
  // Пока транзакция идёт — 'sending'; по её окончании React сам откатывает к 'idle' (в том числе при ошибке).
  const [phase, setPhase] = useOptimistic<SubmitPhase, SubmitPhase>('idle', (_current, next) => next);
  const [, startTransition] = useTransition();

  const handleFailure = useCallback(
    (failure: ClientFailure) => {
      setOutcome({ kind: 'failed', failure });
      if (failure.reason === 'slot_taken') {
        form.resetField('startsAt');
        form.setError('startsAt', { type: 'server', message: failure.message });
        onSlotTaken();
        focusField('startsAt');
        return;
      }
      const field = applyFieldErrors(form, failure);
      if (field !== undefined) focusField(field);
    },
    [form, focusField, onSlotTaken],
  );

  const submit = useCallback(
    (values: BookingFormValues) => {
      // Клиентская проверка min_hours_before: страница могла провисеть открытой, и слот «протух».
      if (Date.parse(values.startsAt) < Date.now() + minHoursBefore * HOUR_MS) {
        form.resetField('startsAt');
        form.setError('startsAt', { type: 'stale', message: SLOT_GONE_MESSAGE });
        onSlotTaken();
        focusField('startsAt');
        return;
      }
      setOutcome({ kind: 'none' });
      startTransition(async () => {
        setPhase('sending');
        // privacyVersion — редакция политики, которую видел клиент; сервер сверяет её с актуальной.
        const result = await browserBookingClient().create({ ...values, prefix: site.prefix, slug: site.slug, privacyVersion: PRIVACY_VERSION });
        if (result.ok) setOutcome({ kind: 'done', booking: result.value });
        else handleFailure(result);
      });
    },
    [form, minHoursBefore, onSlotTaken, focusField, setPhase, site.prefix, site.slug, handleFailure],
  );

  return { outcome, sending: phase === 'sending', submit };
}
