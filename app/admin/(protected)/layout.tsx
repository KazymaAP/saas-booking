// app/admin/(protected)/layout.tsx — все страницы супер-админки кроме входа (ТЗ §13.1, §13.11).
// Проверка isSuperAdmin при каждом рендере; server actions дополнительно проверяют права сами (_lib/guard.ts).
import { redirect } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin-session';
import { AdminSidebar, type NavItem } from '@/главная/components/AdminSidebar';
import { GlassBackground } from '@/главная/components/GlassBackground';
import { GlassHeader } from '@/главная/components/GlassHeader';
import { ToastProvider } from '@/главная/components/Toast';

// Разделы из ТЗ §13.1, которые реализованы в проекте. Чужие зоны (inbox, templates, …) — только ссылки.
// group задаёт секцию бокового меню; порядок групп — по первому появлению.
const NAV: NavItem[] = [
  { href: '/admin', label: 'Админ-студия', group: 'Главное' },
  { href: '/admin/funnel', label: 'Воронка', group: 'Главное' },
  { href: '/admin/businesses', label: 'Бизнесы', group: 'Главное' },
  { href: '/admin/clients', label: 'Клиенты', group: 'Главное' },
  { href: '/admin/inbox', label: 'Входящие', group: 'Главное' },
  { href: '/admin/templates', label: 'Шаблоны', group: 'Контент' },
  { href: '/admin/verticals', label: 'Ниши', group: 'Контент' },
  { href: '/admin/email-accounts', label: 'Ящики', group: 'Контент' },
  { href: '/admin/licenses', label: 'Лицензии', group: 'Учёт' },
  { href: '/admin/stats', label: 'Статистика', group: 'Учёт' },
  { href: '/admin/logs', label: 'Логи', group: 'Учёт' },
  { href: '/admin/settings', label: 'Настройки', group: 'Система' },
  { href: '/admin/backup', label: 'Бэкап', group: 'Система' },
];

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSuperAdmin())) redirect('/admin/login');
  return (
    <div className="panel-shell admin-dark min-h-screen text-white">
      <GlassBackground />
      <a href="#panel-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2">
        Перейти к содержимому
      </a>
      <ToastProvider>
        <div className="md:flex">
          <AdminSidebar items={NAV} />
          <main id="panel-main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-4 outline-none md:px-8 md:py-8">
            <div className="mx-auto max-w-[1180px]">
              <GlassHeader />
              {children}
            </div>
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
