'use client';
// _components/PanelNav.tsx — навигация кабинета (ТЗ §13.9, §13.11).
// Клиентский: aria-current по текущему пути (usePathname) и состояние бургер-меню на телефоне.
// Список разделов приходит с сервера уже отфильтрованным по роли — manager не получает лишних ссылок.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { isActiveSection, sectionHref, type NavItem } from '../_lib/sections';

export function PanelNav({ base, businessName, items, logout }: {
  base: string;
  businessName: string;
  items: NavItem[];
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Переход по ссылке закрывает меню.
  useEffect(() => setOpen(false), [pathname]);

  // Esc закрывает открытое меню и возвращает фокус на кнопку.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <header className="sticky top-0 z-40 border-b border-[#e5e5e5] bg-white">
      <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-2">
        <Link href={base} className="mr-auto truncate font-semibold !no-underline" prefetch>{businessName}</Link>
        <button
          ref={toggleRef}
          type="button"
          className="!min-h-[44px] md:!hidden"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={toggle}
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
          <span className="ml-2">Меню</span>
        </button>
        <form action={logout} className="hidden md:block">
          <button type="submit" className="!min-h-[40px] !border-[#e5e5e5] !bg-white !text-[#1a1a1a]">Выйти</button>
        </form>
      </div>
      <nav
        id={menuId}
        aria-label="Разделы кабинета"
        className={`${open ? 'block' : 'hidden'} border-t border-[#e5e5e5] md:block`}
      >
        <ul className="mx-auto grid max-w-[1100px] gap-1 px-4 py-2 md:flex md:flex-wrap md:gap-1 md:py-1">
          {items.map((item) => {
            const active = isActiveSection(pathname, base, item);
            return (
              <li key={item.key}>
                <Link
                  href={sectionHref(base, item)}
                  // null — префетч до loading.tsx (дёшево), true — полный префетч для частых разделов.
                  prefetch={item.eagerPrefetch ? true : null}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[44px] items-center rounded-md px-3 text-[15px] !no-underline md:min-h-[36px] md:text-[14px] ${active ? 'bg-[#f0f0f0] font-semibold' : 'hover:bg-[#f6f6f6]'}`}
                >
                  {item.label}
                  {/* Точка + текст для диктора: цвет — не единственный признак (design-spec §9). */}
                  {item.badge && (
                    <>
                      <span aria-hidden="true" className="ml-2 inline-block h-2 w-2 rounded-full bg-[#b91c1c]" />
                      <span className="sr-only">, {item.badge}</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
          <li className="md:hidden">
            <form action={logout}>
              <button type="submit" className="mt-1 w-full !min-h-[44px] !border-[#e5e5e5] !bg-white !text-[#1a1a1a]">Выйти</button>
            </form>
          </li>
        </ul>
      </nav>
    </header>
  );
}
