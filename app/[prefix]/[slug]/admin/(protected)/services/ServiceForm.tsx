'use client';
// services/ServiceForm.tsx — форма услуги: добавление и редактирование (ТЗ §4.7).
// Клиентский: react-hook-form + zod (та же схема, что на сервере), ошибки под полями с aria-describedby.
import { useCallback, useId } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FieldFrame, fieldA11y } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { applyServerErrors } from '../_lib/form';
import type { ActionResult } from '../_lib/result';
import { SERVICE_LIMITS, ServiceSchema, type ServiceFormValues, type ServiceRow } from './schema';

const FIELDS: readonly Path<ServiceFormValues>[] = ['name', 'price', 'duration_minutes', 'description'];
const PRICE_HINT = '0 — бесплатно';
const DESCRIPTION_HINT = 'Необязательно';

export function ServiceForm({ defaults, submitLabel, onSubmit, onDone, onCancel, resetOnDone = false }: {
  defaults: ServiceFormValues;
  submitLabel: string;
  onSubmit: (values: ServiceFormValues) => Promise<ActionResult<ServiceRow>>;
  onDone: (row: ServiceRow) => void;
  onCancel?: () => void;
  // true — форма добавления: после успеха очищается для следующей услуги.
  resetOnDone?: boolean;
}) {
  const uid = useId();
  const toast = useToast();
  // raw: true — в action уходят строки как в полях; сервер разбирает их той же схемой.
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<ServiceFormValues>({
    resolver: zodResolver(ServiceSchema, undefined, { raw: true }),
    defaultValues: defaults,
    mode: 'onTouched',
  });

  const submit = useCallback(async (values: ServiceFormValues) => {
    const res = await callAction(() => onSubmit(values));
    if (!res.ok) {
      applyServerErrors(setError, res.fieldErrors, FIELDS);
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? 'Сохранено');
    reset(resetOnDone ? defaults : values);
    if (res.data) onDone(res.data);
  }, [defaults, onDone, onSubmit, reset, resetOnDone, setError, toast]);

  const id = (name: Path<ServiceFormValues>) => `${uid}-${name}`;
  const err = (name: Path<ServiceFormValues>) => errors[name]?.message;

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-3" aria-busy={isSubmitting}>
      <FieldFrame id={id('name')} label="Название" error={err('name')}>
        <input {...register('name')} {...fieldA11y(id('name'), err('name'))} maxLength={SERVICE_LIMITS.nameMax} autoComplete="off" />
      </FieldFrame>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldFrame id={id('price')} label="Цена, ₽" hint={PRICE_HINT} error={err('price')}>
          <input {...register('price')} {...fieldA11y(id('price'), err('price'), PRICE_HINT)} inputMode="numeric" autoComplete="off" />
        </FieldFrame>
        <FieldFrame id={id('duration_minutes')} label="Длительность, мин" error={err('duration_minutes')}>
          <input {...register('duration_minutes')} {...fieldA11y(id('duration_minutes'), err('duration_minutes'))} inputMode="numeric" autoComplete="off" />
        </FieldFrame>
      </div>
      <FieldFrame id={id('description')} label="Описание" hint={DESCRIPTION_HINT} error={err('description')}>
        <textarea {...register('description')} {...fieldA11y(id('description'), err('description'), DESCRIPTION_HINT)} maxLength={SERVICE_LIMITS.descriptionMax} rows={3} />
      </FieldFrame>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={isSubmitting} className="!min-h-[44px]">{isSubmitting ? 'Сохраняем…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={isSubmitting} className="!min-h-[44px]">Отмена</button>}
      </div>
    </form>
  );
}
