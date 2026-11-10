'use client';
// Ручное добавление бизнеса: поля с подписями, ошибки zod под полями, тост с результатом, сброс формы.
import { ActionForm, Field, FormError, SubmitButton } from '@/главная/components/ActionForm';
import { addBusiness } from './actions';

export function AddBusinessForm() {
  return (
    <ActionForm action={addBusiness} resetOnSuccess className="grid max-w-[480px] gap-3" label="Добавить бизнес вручную">
      <Field name="name" label="Название" required maxLength={200} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="city" label="Город" autoComplete="address-level2" maxLength={100} />
        <Field name="phone" label="Телефон" type="tel" inputMode="tel" autoComplete="tel" hint="+7 и 10 цифр" />
      </div>
      <Field name="address" label="Адрес" autoComplete="street-address" maxLength={300} />
      <Field name="email" label="Email" type="email" inputMode="email" autoComplete="email" hint="Есть email — статус «Новый», нет — «Нет контакта»." />
      <FormError />
      <SubmitButton pendingText="Добавляю…">Добавить</SubmitButton>
    </ActionForm>
  );
}
