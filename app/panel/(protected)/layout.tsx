// app/panel/(protected)/layout.tsx — все страницы супер-админки кроме входа.
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isSuperAdmin } from '@/lib/admin-session';

const NAV = [
  { href: '/panel/funnel', label: 'Воронка' },
  { href: '/panel/businesses', label: 'Бизнесы' },
  { href: '/panel/inbox', label: 'Входящие' },
  { href: '/panel/clients', label: 'Клиенты' },
  { href: '/panel/logs', label: 'Логи' },
];

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSuperAdmin())) redirect('/panel/login');
  return (
    <div className="min-h-screen panel-shell">
      <nav className="flex flex-wrap gap-4 border-b border-[#e5e5e5] px-4 py-3 text-[14px]">
        {NAV.map((n) => <Link key={n.href} href={n.href} className="underline">{n.label}</Link>)}
      </nav>
      <div className="mx-auto max-w-[1200px] px-4 py-6">{children}</div>
    </div>
  );
}
