'use client';
// Навигация супер-админки: горизонтальное меню на десктопе, burger на < 768px (ТЗ §13.11).
// aria-current на активном пункте, aria-expanded/aria-controls у кнопки, Esc закрывает меню (ТЗ §19.6).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string };

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Состояние burger: закрывается при переходе и по Esc.
function useBurger(pathname: string) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  // Закрываем меню при переходе на другую страницу.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc закрывает открытое меню.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return { open, toggle, close };
}

export function PanelNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { open, toggle, close } = useBurger(pathname);

  return (
    <nav aria-label="Разделы супер-админки" className="border-b border-[#e5e5e5] bg-white">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-2">
        <Link href="/panel/funnel" className="text-[15px] font-semibold no-underline">Супер-админка</Link>
        <button
          type="button"
          className="md:hidden"
          aria-expanded={open}
          aria-controls="panel-nav-list"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          onClick={toggle}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            {open ? <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" /> : <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" />}
          </svg>
        </button>
        <ul id="panel-nav-list" className={`${open ? 'flex' : 'hidden'} absolute left-0 right-0 top-[52px] z-40 m-0 list-none flex-col gap-1 border-b border-[#e5e5e5] bg-white p-3 md:static md:flex md:flex-row md:flex-wrap md:gap-4 md:border-0 md:p-0`}>
          {items.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={close}
                  className={`block min-h-[44px] rounded-md px-2 py-[10px] text-[14px] md:min-h-0 md:py-1 ${active ? 'font-semibold underline' : 'text-[#444444] no-underline hover:underline'}`}
                >
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
