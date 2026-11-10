'use client';
// (protected)/error.tsx — error boundary кабинета (ТЗ §13.12, §19.5). Клиентский по требованию Next.js.
// Меню из layout остаётся видимым: владелец может уйти в другой раздел или повторить.
import { useEffect, useRef } from 'react';

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Фокус на заголовок — экранный диктор сразу прочитает, что случилось.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section role="alert" className="grid max-w-[560px] gap-3">
      <h1 ref={headingRef} tabIndex={-1} className="outline-none">Что-то пошло не так</h1>
      <p className="text-[14px] text-[#595959]">Не удалось загрузить раздел. Проверьте интернет и попробуйте ещё раз.</p>
      <button type="button" onClick={reset} className="w-fit !min-h-[44px]">Попробовать ещё раз</button>
      {/* digest — id ошибки в логах сервера (без деталей и ПД): владелец может назвать его поддержке. */}
      {error.digest && <p className="!mb-0 text-[13px] text-[#595959]">Код для поддержки: <span className="select-all font-mono">{error.digest}</span></p>}
    </section>
  );
}
