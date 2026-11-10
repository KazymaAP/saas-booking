'use client';
// team/InviteForm.tsx — форма приглашения менеджера: zod на клиенте (та же схема, что в action), ошибка под полем.
// Роль выбирается из списка (встроенные + кастомные роли бизнеса), переданного с сервера.
import { useCallback, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FieldFrame, fieldA11y } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { applyServerErrors } from '../_lib/form';
import { inviteManager } from './actions';
import { EMAIL_MAX, INVITE_FIELDS, InviteSchema, type InviteInput, type InviteResult } from './schema';

type RoleOption = { key: string; label: string };

const EMAIL_HINT = 'На этот адрес менеджер будет входить в кабинет';

export function InviteForm({ slug, roleOptions, onInvited }: { slug: string; roleOptions: RoleOption[]; onInvited: (r: InviteResult) => void }) {
  const uid = useId();
  const toast = useToast();
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<InviteInput>({
    resolver: zodResolver(InviteSchema),
    defaultValues: { email: '', role: 'manager' },
    mode: 'onTouched',
  });

  const submit = useCallback(async (values: InviteInput) => {
    const res = await callAction(() => inviteManager(slug, values));
    if (!res.ok) {
      applyServerErrors(setError, res.fieldErrors, INVITE_FIELDS);
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? 'Готово');
    reset({ email: '', role: 'manager' });
    if (res.data) onInvited(res.data);
  }, [onInvited, reset, setError, slug, toast]);

  const emailId = `${uid}-email`;
  const emailError = errors.email?.message;
  const roleId = `${uid}-role`;
  const roleError = errors.role?.message;
  return (
    <form onSubmit={handleSubmit(submit)} noValidate aria-busy={isSubmitting} className="grid gap-3">
      <FieldFrame id={emailId} label="Email менеджера" hint={EMAIL_HINT} error={emailError}>
        <input {...register('email')} {...fieldA11y(emailId, emailError, EMAIL_HINT)} type="email" inputMode="email" autoComplete="off" maxLength={EMAIL_MAX} />
      </FieldFrame>
      <FieldFrame id={roleId} label="Роль" error={roleError}>
        <select {...register('role')} aria-invalid={roleError ? 'true' : undefined}>
          {roleOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </FieldFrame>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full !min-h-[44px] sm:w-fit">
        {isSubmitting ? 'Создаём доступ…' : 'Добавить менеджера'}
      </button>
    </form>
  );
}
