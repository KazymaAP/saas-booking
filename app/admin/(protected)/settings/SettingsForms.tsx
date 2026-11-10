'use client';
// Формы настроек платформы. Клиентский компонент нужен для useFormState: ошибки zod — под полем
// (aria-invalid + aria-describedby), итог — тост, без перезагрузки страницы.
import { ActionForm, CheckField, Field, FormError, SubmitButton } from '@/главная/components/ActionForm';
import { saveDefaultPrice, saveFlags, saveRateLimits, saveRequisites, saveTariffs } from './actions';
import type { PlatformSettings } from './schema';

const REQUISITE_INPUTS = [
  { name: 'fio', label: 'ФИО', autoComplete: 'name' },
  { name: 'inn', label: 'ИНН', hint: '10 или 12 цифр', inputMode: 'numeric' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'phone', label: 'Телефон', type: 'tel', hint: '+7 и 10 цифр', autoComplete: 'tel' },
  { name: 'city', label: 'Город' },
  { name: 'address', label: 'Адрес для корреспонденции', hint: 'Для договора поручения и запросов субъектов ПД' },
  { name: 'card', label: 'Карта для переводов', hint: 'Показывается владельцам в разделе «Подписка»', inputMode: 'numeric', autoComplete: 'off' },
  { name: 'bank', label: 'Банк' },
  { name: 'nalog_url', label: 'Ссылка «Мой налог»', type: 'url', hint: 'https://…' },
] as const;

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="text-[18px] font-semibold">{title}</h2>
      {hint && <p className="text-[13px] text-[#666666]">{hint}</p>}
      {children}
    </section>
  );
}

export function RequisitesForm({ value }: { value: PlatformSettings['platform_requisites'] }) {
  return (
    <Section id="s-req" title="Реквизиты" hint="Подставляются в футер лендинга, /oferta, /privacy, письма и кабинет владельца (ТЗ §15.5).">
      <ActionForm action={saveRequisites} className="grid gap-3" label="Реквизиты">
        <FormError />
        <div className="grid gap-3 md:grid-cols-2">
          {REQUISITE_INPUTS.map((f) => (
            <Field
              key={f.name}
              name={f.name}
              label={f.label}
              type={'type' in f ? f.type : 'text'}
              hint={'hint' in f ? f.hint : undefined}
              inputMode={'inputMode' in f ? f.inputMode : undefined}
              autoComplete={'autoComplete' in f ? f.autoComplete : undefined}
              defaultValue={value[f.name]}
            />
          ))}
        </div>
        <Field name="oferta" label="Текст оферты" multiline rows={6} maxLength={20000} defaultValue={value.oferta} />
        <Field name="policy" label="Текст политики конфиденциальности" multiline rows={6} maxLength={20000} defaultValue={value.policy} />
        <Field name="dpa" label="Дополнительные условия договора поручения" multiline rows={6} maxLength={20000} defaultValue={value.dpa} />
        <SubmitButton>Сохранить реквизиты</SubmitButton>
      </ActionForm>
    </Section>
  );
}

export function TariffsForm({ value }: { value: PlatformSettings['tariffs'] }) {
  return (
    <Section id="s-tariffs" title="Тарифы" hint="Названия и цены за месяц, ₽.">
      <ActionForm action={saveTariffs} className="grid gap-3" label="Тарифы">
        <FormError />
        <div className="grid gap-3 md:grid-cols-2">
          <Field name="basic.name" label="Тариф 1 — название" required defaultValue={value.basic.name} />
          <Field name="basic.price" label="Тариф 1 — цена, ₽/мес" type="number" inputMode="numeric" required defaultValue={value.basic.price} />
          <Field name="pro.name" label="Тариф 2 — название" required defaultValue={value.pro.name} />
          <Field name="pro.price" label="Тариф 2 — цена, ₽/мес" type="number" inputMode="numeric" required defaultValue={value.pro.price} />
        </div>
        <SubmitButton>Сохранить тарифы</SubmitButton>
      </ActionForm>
    </Section>
  );
}

export function DefaultPriceForm({ value }: { value: PlatformSettings['default_price'] }) {
  return (
    <Section id="s-price" title="Цены по умолчанию" hint="Используются в «Клиентах»: «Отметить оплату» и «Продлить».">
      <ActionForm action={saveDefaultPrice} className="grid gap-3" label="Цены по умолчанию">
        <FormError />
        <div className="grid gap-3 md:grid-cols-2">
          <Field name="initial" label="Разовая оплата, ₽" type="number" inputMode="numeric" required defaultValue={value.initial} />
          <Field name="monthly" label="Подписка, ₽/мес" type="number" inputMode="numeric" required defaultValue={value.monthly} />
        </div>
        <SubmitButton>Сохранить цены</SubmitButton>
      </ActionForm>
    </Section>
  );
}

export function RateLimitsForm({ value }: { value: PlatformSettings['rate_limits'] }) {
  return (
    <Section id="s-limits" title="Ограничения частоты (rate limit)" hint="Сколько запросов с одного IP разрешено на публичных сайтах.">
      <ActionForm action={saveRateLimits} className="grid gap-3" label="Ограничения частоты">
        <FormError />
        <div className="grid gap-3 md:grid-cols-2">
          <Field name="booking_per_10min" label="Броней за 10 минут" type="number" inputMode="numeric" required defaultValue={value.booking_per_10min} />
          <Field name="cancel_per_15min" label="Отмен и переносов за 15 минут" type="number" inputMode="numeric" required defaultValue={value.cancel_per_15min} />
        </div>
        <SubmitButton>Сохранить ограничения</SubmitButton>
      </ActionForm>
    </Section>
  );
}

export function FlagsForm({ value }: { value: PlatformSettings['feature_flags'] }) {
  return (
    <Section id="s-flags" title="Функции (feature flags)">
      <ActionForm action={saveFlags} className="grid gap-2" label="Функции">
        <fieldset className="grid gap-1">
          <legend className="sr-only">Включённые функции</legend>
          <CheckField name="telegram_clients" label="Telegram для клиентов" defaultChecked={value.telegram_clients} />
        </fieldset>
        <SubmitButton>Сохранить</SubmitButton>
      </ActionForm>
    </Section>
  );
}
