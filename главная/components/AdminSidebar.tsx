'use client';
// Боковая навигация супер-админки в стеклянном стиле: плавающая панель на десктопе, выезжающее меню на < 768px (ТЗ §13.11).
// aria-current на активном пункте, aria-expanded/aria-controls у кнопки, Esc закрывает меню (ТЗ §19.6).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; group?: string };

// Корень админки совпадает только точно: иначе он подсвечивался бы на каждом разделе.
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupItems(items: NavItem[]): { name: string; items: NavItem[] }[] {
  const groups: { name: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const name = item.group ?? '';
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = { name, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      {groupItems(items).map((group) => (
        <div key={group.name || 'default'}>
          {group.name && (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">{group.name}</p>
          )}
          <ul className="flex flex-col gap-1">
            {group.items.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                    className={`flex min-h-[40px] items-center rounded-xl px-3 py-2 text-[14px] no-underline transition-colors ${
                      active
                        ? 'bg-gradient-to-r from-sky-500/25 to-blue-600/10 font-semibold text-white ring-1 ring-sky-400/40 shadow-[0_0_20px_rgba(56,189,248,0.25)]'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AdminSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
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

  const brand = (
    <Link href="/admin" className="flex items-center gap-3 no-underline">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-[15px] font-bold text-white shadow-[0_0_18px_rgba(56,189,248,0.35)]"
      >
        З
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] font-semibold text-white">Супер-админка</span>
        <span className="text-[12px] text-white/50">Панель управления</span>
      </span>
    </Link>
  );

  return (
    <>
      {/* Верхняя полоса только на мобильном */}
      <div className="glass sticky top-2 z-30 mx-2 mt-2 flex items-center justify-between px-4 py-3 md:hidden">
        {brand}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="admin-nav-drawer"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          onClick={toggle}
          className="glass-btn !w-10 !p-0"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            {open ? (
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" />
            ) : (
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" />
            )}
          </svg>
        </button>
      </div>

      {open && <div className="fixed inset-0 z-40 bg-black/55 md:hidden" onClick={close} aria-hidden="true" />}

      <aside
        id="admin-nav-drawer"
        aria-label="Разделы супер-админки"
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col overflow-y-auto border-r border-white/10 bg-slate-950/85 p-5 backdrop-blur-xl transition-transform md:sticky md:top-4 md:z-auto md:m-4 md:h-[calc(100vh-2rem)] md:w-[248px] md:shrink-0 md:translate-x-0 md:rounded-3xl md:border md:bg-white/5 md:shadow-[0_4px_30px_rgba(0,0,0,0.1)] ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-4 flex justify-end md:hidden">
          <button type="button" aria-label="Закрыть меню" onClick={close} className="glass-btn !w-10 !p-0">
            ✕
          </button>
        </div>
        <div className="mb-8 hidden md:block">{brand}</div>
        <NavList items={items} pathname={pathname} onNavigate={close} />
      </aside>
    </>
  );
}
