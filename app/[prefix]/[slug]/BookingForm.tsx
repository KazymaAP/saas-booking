'use client';
// Форма брони (ТЗ §5.2, §10.3): услуга → дата → время → контакты → согласие.
// - react-hook-form + zodResolver(bookingFormSchema) — та же схема, что на сервере (lib/schemas.ts);
// - выбор слота — мгновенный (setValue), список слотов — useTransition + AbortController (lib/use-slots);
// - prefetch слотов при наведении/фокусе на дату; skeleton только если загрузка дольше 300 мс;
// - отправка — useOptimistic: кнопка откликается сразу, при ошибке состояние откатывается;
// - a11y (ТЗ §19.6): подписи у всех полей, aria-invalid + aria-describedby, aria-live, фокус на первое невалидное.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useForm, useWatch, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bookingFormSchema, BOOKING_FIELD_ORDER, type BookingField, type BookingFormValues } from '@/lib/schemas';
import { formatPhoneMask } from '@/lib/phone';
import { formatSlotDateTime } from '@/lib/slots';
import { dateBounds, dateOptions, firstOpenDate, isDateInBounds, resolveSchedule, type ClientSchedule } from '@/lib/booking-dates';
import { useDelayedFlag, useSlots, PENDING_TEXT_DELAY_MS } from '@/lib/use-slots';
import { DateStrip, FieldError, SlotPicker, fieldStyles } from './booking-ui';
import { useBookingSubmit } from './use-booking-submit';

type ServiceOption = { id: string; name: string };
type Props = { prefix: string; slug: string; services: ServiceOption[]; schedule?: ClientSchedule };

const PHONE_START = '+7';
const LABEL = 'block text-[14px] font-medium mb-1';
const INPUT = 'input w-full aria-[invalid=true]:border-[#b91c1c]';

// id элементов формы: подпись, поле, ошибка. Один источник, чтобы aria-* не расходились.
function useFieldIds() {
  const base = useId();
  return useMemo(() => {
    const ids = {} as Record<BookingField, { input: string; error: string; label: string }>;
    for (const field of BOOKING_FIELD_ORDER) ids[field] = { input: `${base}-${field}`, error: `${base}-${field}-error`, label: `${base}-${field}-label` };
    return { ...ids, status: `${base}-status`, done: `${base}-done` };
  }, [base]);
}
type FieldIds = ReturnType<typeof useFieldIds>;

// Фокус на поле: обычный input — сам элемент, группа кнопок — выбранная или первая доступная кнопка.
function focusById(id: string): void {
  const element = document.getElementById(id);
  if (element === null) return;
  const target = element.matches('input, select, textarea, button')
    ? element
    : element.querySelector<HTMLElement>('[aria-pressed="true"], button:not([disabled]), input');
  (target ?? element).focus();
}

function aria(form: UseFormReturn<BookingFormValues>, ids: FieldIds, field: BookingField) {
  const invalid = form.formState.errors[field] !== undefined;
  return { id: ids[field].input, 'aria-invalid': invalid, 'aria-describedby': ids[field].error };
}

export function BookingForm({ prefix, slug, services, schedule }: Props) {
  const ids = useFieldIds();
  const resolved = useMemo(() => resolveSchedule(schedule), [schedule]);
  // «Сейчас» фиксируется при монтировании: список дат не прыгает между рендерами.
  const [nowMs] = useState(() => Date.now());
  const options = useMemo(() => dateOptions(resolved, nowMs), [resolved, nowMs]);
  const bounds = useMemo(() => dateBounds(resolved, nowMs), [resolved, nowMs]);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    mode: 'onTouched',
    shouldFocusError: false, // фокус ставим сами: дата и время — группы кнопок, а не input
    defaultValues: {
      serviceId: services[0]?.id ?? '',
      date: firstOpenDate(options),
      startsAt: '',
      name: '',
      phone: PHONE_START,
      email: '',
      telegram: '',
      comment: '',
      privacyAccepted: false, // ТЗ §7: согласие не предзаполнено
    },
  });
  const [serviceId, date, startsAt] = useWatch({ control: form.control, name: ['serviceId', 'date', 'startsAt'] });
  const slots = useSlots({ prefix, slug }, serviceId, date);

  const focusField = useCallback((field: BookingField) => focusById(ids[field].input), [ids]);
  const { outcome, sending, submit } = useBookingSubmit({
    form,
    site: { prefix, slug },
    minHoursBefore: resolved.minHoursBefore,
    focusField,
    onSlotTaken: slots.reload,
  });
  const onInvalid = useCallback(
    (errors: FieldErrors<BookingFormValues>) => {
      const first = BOOKING_FIELD_ORDER.find((field) => errors[field] !== undefined);
      if (first !== undefined) focusField(first);
    },
    [focusField],
  );
  const onSubmit = useMemo(() => form.handleSubmit(submit, onInvalid), [form, submit, onInvalid]);

  // Смена услуги или даты сбрасывает выбранное время: оно относится к другому списку слотов.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    form.setValue('startsAt', '', { shouldValidate: false });
  }, [form, serviceId, date]);

  if (outcome.kind === 'done') return <SuccessPanel id={ids.done} status={outcome.booking.status} startsAt={outcome.booking.startsAt} timeZone={resolved.timeZone} />;

  const failure = outcome.kind === 'failed' && outcome.failure.reason !== 'slot_taken' && outcome.failure.fields === undefined ? outcome.failure : null;
  return (
    <form onSubmit={onSubmit} noValidate aria-describedby={ids.status} className="mt-4 grid max-w-[560px] gap-4">
      <ServiceField form={form} ids={ids} services={services} />
      <DateField form={form} ids={ids} options={options} bounds={bounds} selected={date} onPrefetch={slots.prefetch} />
      <TimeField form={form} ids={ids} slots={slots} selected={startsAt} timeZone={resolved.timeZone} />
      <ContactFields form={form} ids={ids} />
      <PrivacyField form={form} ids={ids} />
      <p id={ids.status} role="alert" aria-live="assertive" style={fieldStyles.error}>
        {failure?.message ?? ''}
      </p>
      <SubmitButton sending={sending} />
    </form>
  );
}

// ---------- Части формы ----------

type PartProps = { form: UseFormReturn<BookingFormValues>; ids: FieldIds };

function ServiceField({ form, ids, services }: PartProps & { services: ServiceOption[] }) {
  // Одна услуга — выбор не нужен, значение уже в defaultValues.
  if (services.length < 2) return null;
  return (
    <div>
      <label htmlFor={ids.serviceId.input} className={LABEL}>Услуга</label>
      <select className={INPUT} {...aria(form, ids, 'serviceId')} {...form.register('serviceId')}>
        {services.map((service) => (
          <option key={service.id} value={service.id}>{service.name}</option>
        ))}
      </select>
      <FieldError id={ids.serviceId.error} message={form.formState.errors.serviceId?.message} />
    </div>
  );
}

type DateFieldProps = PartProps & {
  options: ReturnType<typeof dateOptions>;
  bounds: { min: string; max: string };
  selected: string;
  onPrefetch: (date: string) => void;
};

function DateField({ form, ids, options, bounds, selected, onPrefetch }: DateFieldProps) {
  const select = useCallback((value: string) => form.setValue('date', value, { shouldValidate: true }), [form]);
  const onOther = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      // Дата вне min/max (ручной ввод) — не принимаем: сервер всё равно вернёт пустой список.
      if (value === '' || isDateInBounds(value, bounds)) select(value);
    },
    [bounds, select],
  );
  const error = form.formState.errors.date?.message;
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend id={ids.date.label} className={LABEL}>Дата</legend>
      <div id={ids.date.input}>
        <DateStrip options={options} selected={selected} onSelect={select} onPrefetch={onPrefetch} labelId={ids.date.label} describedBy={ids.date.error} />
      </div>
      <label className="mt-2 flex items-center gap-2 text-[14px]">
        <span>Другая дата</span>
        <input type="date" className="input" min={bounds.min} max={bounds.max} value={selected} onChange={onOther} aria-invalid={error !== undefined} aria-describedby={ids.date.error} />
      </label>
      <FieldError id={ids.date.error} message={error} />
    </fieldset>
  );
}

type TimeFieldProps = PartProps & { slots: ReturnType<typeof useSlots>; selected: string; timeZone: string };

function TimeField({ form, ids, slots, selected, timeZone }: TimeFieldProps) {
  // Отклик на клик — синхронный setValue, без сети: кнопка подсвечивается в том же кадре.
  const select = useCallback((iso: string) => form.setValue('startsAt', iso, { shouldValidate: true }), [form]);
  const error = form.formState.errors.startsAt?.message;
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend id={ids.startsAt.label} className={LABEL}>Время</legend>
      <div id={ids.startsAt.input}>
        <SlotPicker
          state={slots.state}
          showSkeleton={slots.showSkeleton}
          selected={selected}
          timeZone={timeZone}
          onSelect={select}
          labelId={ids.startsAt.label}
          errorId={ids.startsAt.error}
          invalid={error !== undefined}
          emptyText="На эту дату свободного времени нет. Выберите другой день."
        />
      </div>
      <FieldError id={ids.startsAt.error} message={error} />
    </fieldset>
  );
}

function ContactFields({ form, ids }: PartProps) {
  const errors = form.formState.errors;
  const phone = form.register('phone');
  // Маска применяется к значению поля до записи в rhf — в форме всегда «+7 (999) 123-45-67».
  const onPhone = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      event.target.value = formatPhoneMask(event.target.value);
      return phone.onChange(event);
    },
    [phone],
  );
  return (
    <>
      <div>
        <label htmlFor={ids.name.input} className={LABEL}>Имя</label>
        <input className={INPUT} autoComplete="name" {...aria(form, ids, 'name')} {...form.register('name')} />
        <FieldError id={ids.name.error} message={errors.name?.message} />
      </div>
      <div>
        <label htmlFor={ids.phone.input} className={LABEL}>Телефон</label>
        <input type="tel" inputMode="tel" autoComplete="tel" className={INPUT} {...aria(form, ids, 'phone')} {...phone} onChange={onPhone} />
        <FieldError id={ids.phone.error} message={errors.phone?.message} />
      </div>
      <div>
        <label htmlFor={ids.email.input} className={LABEL}>Email <span className="font-normal text-[#595959]">(необязательно)</span></label>
        <input type="email" autoComplete="email" className={INPUT} {...aria(form, ids, 'email')} {...form.register('email')} />
        <FieldError id={ids.email.error} message={errors.email?.message} />
      </div>
      <div>
        <label htmlFor={ids.comment.input} className={LABEL}>Комментарий <span className="font-normal text-[#595959]">(необязательно)</span></label>
        <textarea rows={3} className={`${INPUT} h-auto py-2`} {...aria(form, ids, 'comment')} {...form.register('comment')} />
        <FieldError id={ids.comment.error} message={errors.comment?.message} />
      </div>
    </>
  );
}

function PrivacyField({ form, ids }: PartProps) {
  const error = form.formState.errors.privacyAccepted?.message;
  return (
    <div>
      <label className="flex items-start gap-2 text-[14px]">
        <input type="checkbox" className="mt-1 h-4 w-4" {...aria(form, ids, 'privacyAccepted')} {...form.register('privacyAccepted')} />
        <span>
          Согласен на обработку персональных данных согласно{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">политике конфиденциальности</a>.
        </span>
      </label>
      <FieldError id={ids.privacyAccepted.error} message={error} />
    </div>
  );
}

function SubmitButton({ sending }: { sending: boolean }) {
  // Кнопка блокируется сразу (защита от двойной отправки), а текст «Записываем…» — только если дольше 200 мс.
  const showText = useDelayedFlag(sending, PENDING_TEXT_DELAY_MS);
  return (
    <button type="submit" className="btn-primary min-h-[44px]" disabled={sending} aria-busy={sending}>
      {showText ? 'Записываем…' : 'Записаться'}
    </button>
  );
}

function SuccessPanel({ id, status, startsAt, timeZone }: { id: string; status: string; startsAt: string; timeZone: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Форма исчезла — фокус на результат, чтобы диктор и клавиатура не «потерялись».
  useEffect(() => ref.current?.focus(), []);
  const confirmed = status === 'confirmed';
  return (
    <div id={id} ref={ref} tabIndex={-1} role="status" aria-live="polite" className="mt-4 rounded-lg bg-[#f5f5f5] p-4 outline-none">
      <p className="m-0 font-semibold">{confirmed ? 'Вы записаны' : 'Заявка принята'}</p>
      <p className="m-0 mt-1">{formatSlotDateTime(startsAt, timeZone)}</p>
      <p className="m-0 mt-1 text-[14px] text-[#595959]">
        {confirmed ? 'Запись подтверждена. Ссылка для отмены и переноса — в письме.' : 'Мы свяжемся с вами для подтверждения.'}
      </p>
    </div>
  );
}
