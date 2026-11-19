// app/[prefix]/[slug]/admin/(protected)/layout.tsx — кабинет сервиса: проверка доступа и навигация (ТЗ §13.9–13.11).
// Серверный: доступ проверяется по БД на каждом запросе (currentOwner кэширован на запрос — страница не делает повторных запросов).
// Оформление то же, что у супер-админки: тёмное стекло (.admin-dark), фон GlassBackground,
// боковое меню AdminSidebar и стеклянная шапка. Фирменный цвет бизнеса остаётся акцентом кнопок.
import { redirect } from 'next/navigation';
import { currentOwner, signOutOwner } from '@/lib/owner-session';
import { AdminSidebar, type NavItem } from '@/главная/components/AdminSidebar';
import { GlassBackground } from '@/главная/components/GlassBackground';
import { PanelHeader } from './_components/PanelHeader';
import { ToastProvider } from './_components/Toast';
import { panelBase, sectionHref, SECTIONS, shiftHref } from './_lib/sections';
import { canReadMatrix, type SectionKey } from '@/lib/sections';
import { resolveMatrix } from '@/lib/custom-roles';
import { ROLE_LABELS } from '@/lib/auth-roles';
import { accentColor } from './_lib/color';
import { subscriptionAttention } from './_lib/subscription';
import type { ThemeStyle } from './_lib/panel-theme';

export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

// Группы бокового меню — как в супер-админке: «Главное», «Контент», «Настройки».
// Ключи не перечислены в SECTIONS, поэтому карта живёт здесь: меню остаётся одним списком с группами.
const GROUPS: Readonly<Record<SectionKey, string>> = {
  home: 'Главное', bookings: 'Главное',
  services: 'Контент', photos: 'Контент', texts: 'Контент', reviews: 'Контент', staff: 'Контент', faq: 'Контент',
  notifications: 'Настройки', settings: 'Настройки', appearance: 'Настройки',
  subscription: 'Настройки', team: 'Настройки', data: 'Настройки',
};

export default async function OwnerLayout({ children, params }: { children: React.ReactNode; params: { prefix: string; slug: string } }) {
  const base = panelBase(params);
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${base}/login`);

  // Пароль выдан платформой (временный) — пока владелец не задал свой, кабинет закрыт.
  // Страница /password лежит вне группы (protected), поэтому петли нет.
  if (access.member.must_change_password) redirect(`${base}/password`);

  async function logout() {
    'use server';
    signOutOwner();
    redirect(`${base}/login`);
  }

  // Manager не получает пункты «Настройки», «Подписка», «Команда», «Данные» (ТЗ §13.10). Страницы и actions проверяют роль сами.
  // Отметка у «Подписки» — из уже загруженного бизнеса, без лишних запросов.
  const b = access.business;
  const subscriptionBadge = subscriptionAttention(b.subscription_active, b.subscription_until, Date.now());
  // Меню строится по матрице прав: кастомная роль видит только разрешённые ей разделы.
  const navMatrix = await resolveMatrix(access.member.role, access.business.id);
  const nav: NavItem[] = SECTIONS
    .filter((s) => navMatrix && canReadMatrix(navMatrix, s.key))
    .map((s) => ({
      href: sectionHref(base, s),
      label: s.label,
      group: GROUPS[s.key],
      badge: s.key === 'subscription' ? subscriptionBadge : null,
    }));

  const shift = shiftHref(access.role, params);
  // Акцент — фирменный цвет бизнеса, если он задан (accentColor гарантирует контраст с белым);
  // иначе акцент стеклянной темы (#38bdf8) и тёмный текст на нём, как в супер-админке.
  const brand = accentColor(b.brand_color);
  const brandStyle: ThemeStyle = brand ? { '--brand-color': brand, '--on-accent': '#ffffff' } : {};
  const role = access.role ?? '';
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <div className="panel-shell admin-dark min-h-screen text-white" style={brandStyle}>
      <GlassBackground />
      <a href="#panel-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2">
        Перейти к содержимому
      </a>
      <ToastProvider>
        <div className="md:flex">
          <AdminSidebar
            items={nav}
            brandHref={base}
            brandTitle={b.name}
            brandSubtitle="Кабинет сервиса"
            brandLetter={b.name.trim().charAt(0).toUpperCase() || '•'}
            navLabel="Разделы кабинета"
            footer={
              <div className="flex flex-col gap-2">
                {shift && (
                  <a href={shift} className="glass-btn w-full !min-h-[40px] !no-underline">Моя смена</a>
                )}
                <form action={logout}>
                  <button type="submit" className="glass-btn w-full !min-h-[40px]">Выйти</button>
                </form>
              </div>
            }
          />
          <main id="panel-main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-4 outline-none md:px-8 md:py-8">
            <div className="mx-auto max-w-[1180px]">
              <PanelHeader businessName={b.name} roleLabel={roleLabel} shiftHref={shift} logout={logout} />
              {children}
            </div>
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
