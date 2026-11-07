'use client';
// subscription/PaidReport.tsx — «Я оплатил»: сообщение админу платформы (ТЗ §14.1–14.2).
// Клиентский: форма с валидацией zod, disabled во время отправки, toast о результате.
// После успеха форма заменяется подтверждением, чтобы не отправлять повторно.
import { useCallback, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FieldFrame, fieldA11y } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { applyServerErrors } from '../_lib/form';
import { reportPayment } from './actions';
import { PAID_FIELDS, PAID_LIMITS, PaidSchema, type PaidInput } from './schema';

const AMOUNT_HINT = 'Если пусто — сумма тарифа';
const COMMENT_HINT = 'Например, с какой карты или номер операции';

export function PaidReport({ slug, defaultAmount }: { slug: string; defaultAmount: string }) {
  const uid = useId();
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<PaidInput>({
    resolver: zodResolver(PaidSchema, undefined, { raw: true }),
    defaultValues: { amount: defaultAmount, comment: '' },
    mode: 'onTouched',
  });

  const submit = useCallback(async (values: PaidInput) => {
    const res = await callAction(() => reportPayment(slug, values));
    if (!res.ok) {
      applyServerErrors(setError, res.fieldErrors, PAID_FIELDS);
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? 'Отправлено');
    setSent(true);
  }, [setError, slug, toast]);

  if (sent) {
    return (
      <section role="status" className="rounded-xl border border-[#86efac] bg-[#f0fdf4] p-4 text-[14px] text-[#14532d]">
        <p className="!mb-0 font-semibold">Сообщение отправлено</p>
        <p className="!mb-0">Проверим поступление и продлим подписку. Обычно — в течение рабочего дня.</p>
      </section>
    );
  }

  const amountId = `${uid}-amount`;
  const commentId = `${uid}-comment`;
  return (
    <form onSubmit={handleSubmit(submit)} noValidate aria-labelledby={`${uid}-title`} aria-busy={isSubmitting}
      className="grid gap-3 rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4">
      <h2 id={`${uid}-title`} className="!mb-0">Уже оплатили?</h2>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <FieldFrame id={amountId} label="Сумма, ₽" hint={AMOUNT_HINT} error={errors.amount?.message}>
          <input {...register('amount')} {...fieldA11y(amountId, errors.amount?.message, AMOUNT_HINT)} inputMode="numeric" autoComplete="off" />
        </FieldFrame>
        <FieldFrame id={commentId} label="Комментарий" hint={COMMENT_HINT} error={errors.comment?.message}>
          <input {...register('comment')} {...fieldA11y(commentId, errors.comment?.message, COMMENT_HINT)} maxLength={PAID_LIMITS.commentMax} autoComplete="off" />
        </FieldFrame>
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full !min-h-[44px] sm:w-fit">
        {isSubmitting ? 'Отправляем…' : 'Я оплатил'}
      </button>
    </form>
  );
}
