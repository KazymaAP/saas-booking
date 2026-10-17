'use client';
// data/DeleteAccount.tsx — запрос на удаление аккаунта с подтверждением вводом адреса сайта (ТЗ §32, design-spec §6).
// Клиентский: кнопка активна только при совпадении, disabled во время отправки, toast и aria-live о результате.
import { useCallback, useId, useState, useTransition } from 'react';
import { FieldFrame, fieldA11y } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { formatDate } from '../_lib/time';
import { requestDeletion } from './actions';
import { DELETION_GRACE_DAYS, confirmationMatches } from './rules';

export function DeleteAccount({ slug, siteSlug }: { slug: string; siteSlug: string }) {
  const uid = useId();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = confirmationMatches(value, siteSlug);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(undefined);
  }, []);

  const onSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!matches) {
      setError(`Введите ${siteSlug}`);
      return;
    }
    startTransition(async () => {
      const res = await callAction(() => requestDeletion(slug, value));
      if (!res.ok) {
        setError(res.fieldErrors?.confirmation);
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? 'Запрос принят');
      setScheduledAt(res.data?.scheduledAt ?? '');
    });
  }, [matches, siteSlug, slug, toast, value]);

  if (scheduledAt !== null) {
    return (
      <p role="status" className="!mb-0 text-[14px]">
        Запрос принят. Данные будут удалены{scheduledAt ? ` ${formatDate(scheduledAt)}` : ` через ${DELETION_GRACE_DAYS} дней`}.
      </p>
    );
  }

  const id = `${uid}-confirm`;
  const hint = `Чтобы подтвердить, введите адрес сайта: ${siteSlug}`;
  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} className="grid gap-3">
      <p className="!mb-0 text-[14px] text-[#595959]">
        Сайт перестанет принимать записи сразу. Через {DELETION_GRACE_DAYS} дней удалятся брони, услуги, фото и тексты. Журнал рассылки сохранится.
      </p>
      <FieldFrame id={id} label="Подтверждение" hint={hint} error={error}>
        <input value={value} onChange={onChange} {...fieldA11y(id, error, hint)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </FieldFrame>
      <button type="submit" disabled={pending || !matches} className="w-full !min-h-[44px] !border-[#b91c1c] !bg-[#b91c1c] !text-white disabled:opacity-50 sm:w-fit">
        {pending ? 'Отправляем…' : 'Удалить аккаунт'}
      </button>
    </form>
  );
}
