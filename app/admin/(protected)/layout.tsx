// app/admin/(protected)/layout.tsx — все страницы супер-админки кроме входа (ТЗ §13.1, §13.11).
// Проверка isSuperAdmin при каждом рендере; server actions дополнительно проверяют права сами (_lib/guard.ts).
import { redirect } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin-session';
import { PanelNav, type NavItem } from '@/главная/components/PanelNav';
import { ToastProvider } from '@/главная/components/Toast';

// Разделы из ТЗ §13.1, которые реализованы в проекте. Чужие зоны (inbox, templates, …) — только ссылки.
const NAV: NavItem[] = [
  { href: '/admin/funnel', label: 'Воронка' },
  { href: '/admin/businesses', label: 'Бизнесы' },
  { href: '/admin/clients', label: 'Клиенты' },
  { href: '/admin/inbox', label: 'Входящие' },
  { href: '/admin/templates', label: 'Шаблоны' },
  { href: '/admin/verticals', label: 'Ниши' },
  { href: '/admin/email-accounts', label: 'Ящики' },
  { href: '/admin/licenses', label: 'Лицензии' },
  { href: '/admin/stats', label: 'Статистика' },
  { href: '/admin/logs', label: 'Логи' },
  { href: '/admin/settings', label: 'Настройки' },
  { href: '/admin/backup', label: 'Бэкап' },
  { href: '/admin', label: 'Админ-студия' },
];

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSuperAdmin())) redirect('/admin/login');
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
