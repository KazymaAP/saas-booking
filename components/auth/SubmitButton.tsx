'use client';
// components/auth/SubmitButton.tsx — кнопка отправки auth-форм: блокируется на время запроса
// (нет двойной отправки), состояние объявляется скринридеру через aria-busy и текст кнопки.
import { useFormStatus } from 'react-dom';

export function SubmitButton({ label, pendingLabel }: { readonly label: string; readonly pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
