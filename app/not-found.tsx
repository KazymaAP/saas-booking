// app/not-found.tsx — 404 для всего приложения (раньше отдавалась стандартная страница Next).
// Частый случай: клиент открыл старую ссылку на сайт бизнеса, который переехал на другой адрес.
import Link from 'next/link';
import type { CSSProperties } from 'react';

export const metadata = {
  title: 'Страница не найдена',
  robots: { index: false, follow: false },
};

const palette = {
  '--bg': '#070b14',
  '--surface': '#0d1424',
  '--border': '#1b2740',
  '--text': '#f2f6ff',
  '--muted': '#9fb0cc',
  '--accent': '#3b82f6',
} as CSSProperties;

export default function NotFound() {
  return (
    <main
      style={{ ...palette, background: 'var(--bg)' }}
      className="grid min-h-screen place-items-center px-5 py-16"
      // Фон задаём инлайном: страница должна выглядеть нормально, даже если CSS не загрузился.
    >
      <div className="w-full max-w-[520px] text-center" style={{ color: 'var(--text)' }}>
        <div
          className="mx-auto grid size-16 place-items-center rounded-2xl text-[22px] font-semibold"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--accent)' }}
          aria-hidden="true"
        >
          404
        </div>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight">Такой страницы нет</h1>
        <p className="mt-3 text-[15px] leading-6" style={{ color: 'var(--muted)' }}>
          Возможно, ссылка устарела или сайт переехал на другой адрес. Проверьте написание адреса —
          он указан в письме или визитке.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full px-5 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            На главную
          </Link>
          <Link
            href="/auth"
            className="rounded-full px-5 py-2.5 text-[14px] font-medium transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            Войти в кабинет
          </Link>
        </div>
      </div>
    </main>
  );
}
