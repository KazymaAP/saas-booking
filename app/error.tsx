'use client';

// app/error.tsx — граница ошибок для всего приложения. До этого любой сбой на публичной странице
// показывал стандартный экран Next («Application error»), где клиенту нечего делать.
// Кнопка «Попробовать снова» перерисовывает сегмент, digest помогает найти ошибку в логах.
import Link from 'next/link';
import { useEffect, type CSSProperties } from 'react';

const palette = {
  '--bg': '#070b14',
  '--surface': '#0d1424',
  '--border': '#1b2740',
  '--text': '#f2f6ff',
  '--muted': '#9fb0cc',
  '--accent': '#3b82f6',
} as CSSProperties;

export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Клиентская ошибка не уходит в audit_log: там только серверные события. Пишем в консоль
    // с digest, чтобы разработчик мог сопоставить с серверным логом.
    console.error('[route-error]', error.digest ?? '', error.message);
  }, [error]);

  return (
    <main style={{ ...palette, background: 'var(--bg)' }} className="grid min-h-screen place-items-center px-5 py-16">
      <div className="w-full max-w-[520px] text-center" style={{ color: 'var(--text)' }}>
        <div
          className="mx-auto grid size-16 place-items-center rounded-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          aria-hidden="true"
        >
          <span className="text-[22px] font-semibold" style={{ color: 'var(--accent)' }}>
            !
          </span>
        </div>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight">Страница не открылась</h1>
        <p className="mt-3 text-[15px] leading-6" style={{ color: 'var(--muted)' }}>
          Мы уже записали сбой. Попробуйте обновить — обычно помогает. Если повторяется, напишите в поддержку
          и укажите код ниже.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
            код: {error.digest}
          </p>
        )}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full px-5 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Попробовать снова
          </button>
          <Link
            href="/"
            className="rounded-full px-5 py-2.5 text-[14px] font-medium"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
