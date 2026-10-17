// app/panel/(protected)/layout.tsx — все страницы супер-админки кроме входа (ТЗ §13.1, §13.11).
// Проверка isSuperAdmin при каждом рендере; server actions дополнительно проверяют права сами (_lib/guard.ts).
import { redirect } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin-session';
import { PanelNav, type NavItem } from './_components/PanelNav';
import { ToastProvider } from './_components/Toast';

// Разделы из ТЗ §13.1, которые реализованы в проекте. Чужие зоны (inbox, templates, …) — только ссылки.
const NAV: NavItem[] = [
  { href: '/panel/funnel', label: 'Воронка' },
  { href: '/panel/businesses', label: 'Бизнесы' },
  { href: '/panel/clients', label: 'Клиенты' },
  { href: '/panel/inbox', label: 'Входящие' },
  { href: '/panel/templates', label: 'Шаблоны' },
  { href: '/panel/verticals', label: 'Ниши' },
  { href: '/panel/email-accounts', label: 'Ящики' },
  { href: '/panel/licenses', label: 'Лицензии' },
  { href: '/panel/stats', label: 'Статистика' },
  { href: '/panel/logs', label: 'Логи' },
  { href: '/panel/settings', label: 'Настройки' },
  { href: '/panel/backup', label: 'Бэкап' },
];

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSuperAdmin())) redirect('/panel/login');
  return (
    <div className="min-h-screen panel-shell">
      <a href="#panel-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2">
        Перейти к содержимому
      </a>
      <ToastProvider>
        <header className="relative">
          <PanelNav items={NAV} />
        </header>
        <main id="panel-main" tabIndex={-1} className="mx-auto max-w-[1200px] px-4 py-6 outline-none">
          {children}
        </main>
      </ToastProvider>
    </div>
  );
}
