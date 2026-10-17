'use client';
// Error boundary страниц отмены и переноса (app/[prefix]/[slug]/booking/**).
// Сбой БД при загрузке брони не должен превращаться в пустой экран: показываем понятный текст
// и кнопку повтора (reset перерисовывает сегмент без перезагрузки страницы). Детали ошибки не выводим.
import { useEffect, useRef } from 'react';

type Props = { error: Error & { digest?: string }; reset: () => void };

export default function BookingError({ reset }: Props) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Фокус на заголовок: диктор сразу озвучивает, что случилось.
  useEffect(() => ref.current?.focus(), []);
  return (
    <main className="mx-auto max-w-[520px] px-4 py-10">
      <h1 ref={ref} tabIndex={-1} className="text-[24px] font-semibold outline-none">
        Не удалось загрузить запись
      </h1>
      <p role="alert" className="mt-4">
        Что-то пошло не так. Попробуйте ещё раз через минуту.
      </p>
      <button type="button" onClick={reset} className="btn-primary mt-6 min-h-[44px]">
        Попробовать снова
      </button>
    </main>
  );
}
