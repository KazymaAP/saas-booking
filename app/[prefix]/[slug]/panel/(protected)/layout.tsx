// app/[prefix]/[slug]/panel/(protected)/layout.tsx — кабинет владельца: проверка доступа и навигация (ТЗ §5.3).
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentOwner, signOutOwner } from '@/lib/owner-session';

export const dynamic = 'force-dynamic';

export default async function OwnerLayout({ children, params }: { children: React.ReactNode; params: { prefix: string; slug: string } }) {
  const base = `/${params.prefix}/${params.slug}/panel`;
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${base}/login`);

  async function logout() {
    'use server';
    signOutOwner();
    redirect(`/${params.prefix}/${params.slug}/panel/login`);
  }

  const nav = [
    { href: base, label: 'Главная' },
    { href: `${base}/bookings`, label: 'Брони' },
    { href: `${base}/services`, label: 'Услуги' },
    { href: `${base}/photos`, label: 'Фото' },
    { href: `${base}/settings`, label: 'Настройки' },
    { href: `${base}/subscription`, label: 'Подписка' },
    { href: `${base}/texts`, label: 'Тексты' },
    { href: `${base}/notifications`, label: 'Уведомления' },
    { href: `${base}/data`, label: 'Данные' },
    { href: `${base}/team`, label: 'Команда' },
  ];

  return (
    <div className="min-h-screen panel-shell">
      <nav className="flex flex-wrap items-center gap-4 border-b border-[#e5e5e5] px-4 py-3 text-[14px]">
        <span className="font-semibold">{access.business.name}</span>
        {nav.filter((n) => access.member.role === 'owner' || !['settings', 'subscription', 'team'].includes(n.href.split('/').pop() ?? '')).map((n) => <Link key={n.href} href={n.href} className="underline">{n.label}</Link>)}
        <form action={logout} className="ml-auto"><button type="submit" className="underline">Выйти</button></form>
      </nav>
      <div className="mx-auto max-w-[1000px] px-4 py-6">{children}</div>
    </div>
  );
}
