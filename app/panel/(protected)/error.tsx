'use client';
// app/panel/(protected)/error.tsx — error boundary разделов супер-админки (ТЗ §13.12, §19.5).
// Текст без технических деталей; digest помогает найти запись в логах сервера.
import { useEffect, useRef } from 'react';

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Фокус на заголовок: скринридер сразу объявляет ошибку.
  useEffect(() => {
    heading.current?.focus();
  }, [error]);

  return (
    <div role="alert" className="grid max-w-[560px] gap-3">
      <h1 ref={heading} tabIndex={-1} className="outline-none">Что-то пошло не так</h1>
      <p className="text-[14px] text-[#666666]">Не удалось загрузить раздел. Попробуйте ещё раз.</p>
      {error.digest && <p className="text-[12px] text-[#666666]">Код ошибки: {error.digest}</p>}
      <button type="button" onClick={reset} className="w-fit">Повторить</button>
    </div>
  );
}
