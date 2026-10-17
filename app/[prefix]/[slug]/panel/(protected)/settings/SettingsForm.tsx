'use client';
// settings/SettingsForm.tsx — форма настроек (ТЗ §4.6, §19.6). react-hook-form + та же zod-схема, что на сервере.
// Рабочее время проверяется при вводе (lib/hours.ts): ошибка под нужным днём, с понятным текстом.
import { useCallback, useId } from 'react';
import { useForm, type FieldPath, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DAY_KEYS, DAY_LABELS } from '@/lib/hours';
import { formatPhoneMask } from '@/lib/phone';
import { FieldFrame, fieldA11y } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { applyServerErrors } from '../_lib/form';
import { useUnsavedGuard } from '../_lib/useUnsavedGuard';
import { saveSettings } from './actions';
import { SETTINGS_FIELDS, SLOT_STEPS, SettingsSchema, type SettingsFormValues } from './schema';

type Name = FieldPath<SettingsFormValues>;
type Ctx = { register: UseFormRegister<SettingsFormValues>; err: (n: Name) => string | undefined; id: (n: Name) => string };

const HOURS_HINT = 'Например: 09:00-13:00, 14:00-20:00. Пусто или «выходной» — не работаем';
const PHONES_HINT = 'Через запятую, до 3 номеров';
const COLOR_HINT = 'Кнопки и акценты на сайте и в кабинете';

export function SettingsForm({ slug, defaults }: { slug: string; defaults: SettingsFormValues }) {
  const uid = useId();
  const toast = useToast();
  const { register, handleSubmit, setError, reset, getFieldState, formState } = useForm<SettingsFormValues>({
    resolver: zodResolver(SettingsSchema, undefined, { raw: true }),
    defaultValues: defaults,
    mode: 'onTouched',
    shouldFocusError: true,
  });
  // Длинная форма: несохранённые правки не теряются при закрытии вкладки / перезагрузке.
  useUnsavedGuard(formState.isDirty && !formState.isSubmitting);

  const submit = useCallback(async (values: SettingsFormValues) => {
    const res = await callAction(() => saveSettings(slug, values));
    if (!res.ok) {
      applyServerErrors(setError, res.fieldErrors, SETTINGS_FIELDS);
      toast.error(res.error);
      return;
    }
    reset(values); // форма снова «чистая» — кнопка неактивна до следующей правки
    toast.success(res.message ?? 'Сохранено');
  }, [reset, setError, slug, toast]);

  const onInvalid = useCallback(() => toast.error('Проверьте выделенные поля'), [toast]);

  const ctx: Ctx = {
    register,
    id: (n) => `${uid}-${n.replace('.', '-')}`,
    // getFieldState типизирован по пути поля, в том числе вложенного «hours.mon».
    err: (n) => getFieldState(n, formState).error?.message,
  };

  return (
    <form onSubmit={handleSubmit(submit, onInvalid)} noValidate className="grid max-w-[640px] gap-6" aria-busy={formState.isSubmitting}>
      <AboutSection ctx={ctx} />
      <ContactsSection ctx={ctx} />
      <HoursSection ctx={ctx} />
      <BookingSection ctx={ctx} />
      {/* Кнопка прилипает к низу экрана на телефоне: длинная форма, сохранить можно с любого места. */}
      <div className="sticky bottom-0 -mx-4 border-t border-[#e5e5e5] bg-white/95 px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button type="submit" disabled={formState.isSubmitting || !formState.isDirty} className="w-full !min-h-[44px] sm:w-auto">
          {formState.isSubmitting ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}

function TextField({ ctx, name, label, hint, ...rest }: { ctx: Ctx; name: Name; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = ctx.id(name);
  const error = ctx.err(name);
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <input {...rest} {...ctx.register(name)} {...fieldA11y(id, error, hint)} />
    </FieldFrame>
  );
}

function AboutSection({ ctx }: { ctx: Ctx }) {
  const id = ctx.id('description');
  const error = ctx.err('description');
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-[18px] font-semibold">О бизнесе</legend>
      <TextField ctx={ctx} name="name" label="Название" maxLength={120} autoComplete="organization" />
      <FieldFrame id={id} label="Описание" error={error}>
        <textarea {...ctx.register('description')} {...fieldA11y(id, error)} rows={4} maxLength={1000} />
      </FieldFrame>
      <BrandColor ctx={ctx} />
    </fieldset>
  );
}

function BrandColor({ ctx }: { ctx: Ctx }) {
  const id = ctx.id('brand_color');
  const error = ctx.err('brand_color');
  return (
    <FieldFrame id={id} label="Цвет сайта" hint={COLOR_HINT} error={error}>
      <input type="color" {...ctx.register('brand_color')} {...fieldA11y(id, error, COLOR_HINT)} className="h-11 w-24 cursor-pointer rounded-md border border-[#e5e5e5] bg-white p-1" />
    </FieldFrame>
  );
}

function ContactsSection({ ctx }: { ctx: Ctx }) {
  // Маска на уходе с поля: при наборе курсор не прыгает, а номер приводится к виду +7 (999) 123-45-67.
  const phones = ctx.register('phones');
  const onBlur = useCallback(async (e: React.FocusEvent<HTMLInputElement>) => {
    const formatted = e.target.value.split(',').map((p) => p.trim()).filter(Boolean)
      .map((p) => (p.replace(/\D/g, '').length >= 10 ? formatPhoneMask(p) : p)).join(', ');
    if (formatted !== e.target.value) e.target.value = formatted;
    await phones.onChange(e);
    await phones.onBlur(e);
  }, [phones]);
  const id = ctx.id('phones');
  const error = ctx.err('phones');

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-[18px] font-semibold">Контакты и адрес</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField ctx={ctx} name="city" label="Город" maxLength={80} autoComplete="address-level2" />
        <TextField ctx={ctx} name="address" label="Адрес" maxLength={250} autoComplete="street-address" />
      </div>
      <FieldFrame id={id} label="Телефоны" hint={PHONES_HINT} error={error}>
        <input {...phones} onBlur={onBlur} {...fieldA11y(id, error, PHONES_HINT)} type="tel" inputMode="tel" autoComplete="tel" />
      </FieldFrame>
      <TextField ctx={ctx} name="emails" label="Email для клиентов" hint="Через запятую, до 3 адресов" inputMode="email" autoComplete="email" />
    </fieldset>
  );
}

function HoursSection({ ctx }: { ctx: Ctx }) {
  return (
    <fieldset className="grid gap-2" aria-describedby={`${ctx.id('hours.mon')}-legend-hint`}>
      <legend className="mb-1 text-[18px] font-semibold">Рабочее время</legend>
      <p id={`${ctx.id('hours.mon')}-legend-hint`} className="!mb-1 text-[13px] text-[#595959]">{HOURS_HINT}</p>
      {DAY_KEYS.map((d) => {
        const name: Name = `hours.${d}`;
        const id = ctx.id(name);
        const error = ctx.err(name);
        return (
          <div key={d} className="grid gap-1 sm:grid-cols-[150px_1fr] sm:items-start sm:gap-3">
            <label htmlFor={id} className="pt-2 text-[14px] font-medium">{DAY_LABELS[d]}</label>
            <div className="grid gap-1">
              <input {...ctx.register(name)} {...fieldA11y(id, error)} placeholder="выходной" autoComplete="off" inputMode="text" />
              {error && <p id={`${id}-error`} role="alert" className="!m-0 text-[13px] text-[#b91c1c]">{DAY_LABELS[d]}: {error}</p>}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

function BookingSection({ ctx }: { ctx: Ctx }) {
  const stepId = ctx.id('slot_step_minutes');
  const stepError = ctx.err('slot_step_minutes');
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-[18px] font-semibold">Онлайн-запись</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldFrame id={stepId} label="Шаг записи" error={stepError}>
          <select {...ctx.register('slot_step_minutes')} {...fieldA11y(stepId, stepError)}>
            {SLOT_STEPS.map((n) => <option key={n} value={String(n)}>{n} минут</option>)}
          </select>
        </FieldFrame>
        <TextField ctx={ctx} name="max_days_ahead" label="Запись вперёд, дней" hint="От 1 до 365" inputMode="numeric" />
        <TextField ctx={ctx} name="min_hours_before" label="Не позже чем за, ч" hint="Минимум до начала записи" inputMode="numeric" />
        <TextField ctx={ctx} name="cancel_hours_before" label="Отмена клиентом за, ч" hint="0 — в любой момент" inputMode="numeric" />
      </div>
      <label className="flex min-h-[44px] items-center gap-3 text-[14px]">
        <input type="checkbox" {...ctx.register('auto_confirm')} className="h-5 w-5" />
        Подтверждать новые записи автоматически
      </label>
    </fieldset>
  );
}
