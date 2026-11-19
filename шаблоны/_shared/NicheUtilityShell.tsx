'use client';
// шаблоны/_shared/NicheUtilityShell.tsx — оболочка служебных страниц витрины
// («Моя запись» и т.п.) в том же стиле, что и основной сайт-витрина.
import type { ReactNode } from 'react';
import { CalendarCheck, House, UserCircle } from '@phosphor-icons/react';
import { Glyph } from './glyph';
import { buildPalette, hexToRgbTuple } from './palette';
import type { IconKey, NicheTheme } from './niche-tenant';

type Props = {
  name: string;
  prefix: string;
  slug: string;
  /** Тема ниши: акцент, режим и глиф. Без неё страница остаётся нейтрально-тёмной. */
  theme?: NicheTheme | null;
  /** Логотип бизнеса: раньше в шапке всегда стояла иконка машины. */
  logo?: string | null;
  children: ReactNode;
};

export function NicheUtilityShell({ name, prefix, slug, theme, logo, children }: Props) {
  const base = `/${prefix}/${slug}`;
  // Раньше здесь были жёстко прописаны чёрный фон и синий акцент: салон красоты с розовой
  // темой получал синюю кнопку и иконку автомобиля. Теперь палитра берётся из темы ниши,
  // а нейтральный тёмный набор остаётся только запасным вариантом.
  const bg = theme ? `rgb(${hexToRgbTuple(theme.bg).join(' ')})` : '#000000';
  const fg = theme ? `rgb(${hexToRgbTuple(theme.text).join(' ')})` : '#ffffff';
  const style = theme
    ? { ...buildPalette(theme), backgroundColor: bg, color: fg }
    : {
        '--color-bg': '0 0 0',
        '--color-surface': '10 10 10',
        '--color-border': '36 36 36',
        '--color-border-hover': '54 54 60',
        '--color-text': '255 255 255',
        '--color-text-muted': '145 145 158',
        '--color-text-subtle': '125 125 135',
        '--color-accent': '70 144 255',
        '--color-accent-solid': '56 115 204',
        '--color-accent-solid-hover': '50 103 184',
        '--color-success': '34 197 94',
        '--color-error': '239 68 68',
        backgroundColor: bg,
        color: fg,
      };
  const glyph: IconKey = theme?.glyph ?? 'calendar';

  return (
    <div className="detailing-root min-h-screen" style={style} data-mode={theme?.mode ?? 'dark'}>
      {/* Критический фон до загрузки внешнего CSS: иначе при переходе мелькает белый экран. */}
      <style>{`html,body{background:${bg};color:${fg}}`}</style>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-scoped.css" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-fonts.css" />

      <header className="safe-area-top sticky top-0 z-sticky bg-[rgb(var(--color-bg)/0.82)] backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[69rem] items-center justify-between border-b border-brand-border px-4 md:h-[92px] md:px-6">
          <a href={base} aria-label={`${name} — на главную`} className="group flex items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg">
            <span className="grid size-12 place-items-center overflow-hidden rounded-full border border-brand-border bg-brand-surface text-brand-text transition-transform duration-normal group-hover:scale-105 md:size-[52px]">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="size-full object-cover" loading="lazy" />
              ) : (
                <Glyph icon={glyph} size={22} weight="fill" />
              )}
            </span>
            <span className="text-[16px] font-semibold leading-none tracking-[-0.01em]">{name}</span>
          </a>
          <a href={`${base}/booking/last`} aria-label="Профиль клиента" className="grid size-10 place-items-center rounded-full border border-brand-border text-brand-text-muted transition-colors hover:border-brand-border hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg">
            <UserCircle size={21} weight="bold" />
          </a>
        </div>
      </header>

      <main className="pb-28 md:pb-24" id="top">
        <div className="section container max-w-screen-md">{children}</div>
      </main>

      <nav className="bottom-nav safe-area-bottom" aria-label="Основная навигация">
        <div className="bottom-nav__inner">
          <a href={base} aria-label="Главная" className="bottom-nav__item press">
            <House size={20} weight="bold" />
            <span>Главная</span>
          </a>
          <a href={`${base}?book=1`} aria-label="Услуги" className="bottom-nav__item press">
            <Glyph icon={glyph} size={20} weight="bold" />
            <span>Услуги</span>
          </a>
          <a href={`${base}/booking/last`} aria-label="Моя запись" aria-current="page" className="bottom-nav__item press is-active">
            <CalendarCheck size={20} weight="bold" />
            <span>Моя запись</span>
          </a>
        </div>
      </nav>
    </div>
  );
}
