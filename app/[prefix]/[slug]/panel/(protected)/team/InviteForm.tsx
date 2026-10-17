'use client';
// team/InviteForm.tsx — форма приглашения менеджера: zod на клиенте (та же схема, что в action), ошибка под полем.
import { useCallback, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FieldFrame, fieldA11y } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { applyServerErrors } from '../_lib/form';
import { inviteManager } from './actions';
import { EMAIL_MAX, INVITE_FIELDS, InviteSchema, type InviteInput, type InviteResult } from './schema';

const EMAIL_HINT = 'На этот адрес менеджер будет входить в кабинет';

export function InviteForm({ slug, onInvited }: { slug: string; onInvited: (r: InviteResult) => void }) {
  const uid = useId();
  const toast = useToast();
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<InviteInput>({
    resolver: zodResolver(InviteSchema),
    defaultValues: { email: '' },
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
    reset({ email: '' });
    if (res.data) onInvited(res.data);
  }, [onInvited, reset, setError, slug, toast]);

  const id = `${uid}-email`;
  const error = errors.email?.message;
  return (
    <form onSubmit={handleSubmit(submit)} noValidate aria-busy={isSubmitting} className="grid gap-3">
      <FieldFrame id={id} label="Email менеджера" hint={EMAIL_HINT} error={error}>
        <input {...register('email')} {...fieldA11y(id, error, EMAIL_HINT)} type="email" inputMode="email" autoComplete="off" maxLength={EMAIL_MAX} />
      </FieldFrame>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full !min-h-[44px] sm:w-fit">
        {isSubmitting ? 'Создаём доступ…' : 'Добавить менеджера'}
      </button>
    </form>
  );
}
