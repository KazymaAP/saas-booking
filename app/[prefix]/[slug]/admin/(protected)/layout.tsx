// app/[prefix]/[slug]/admin/(protected)/layout.tsx — кабинет владельца: проверка доступа и навигация (ТЗ §13.9–13.11).
// Серверный: доступ проверяется по БД на каждом запросе (currentOwner кэширован на запрос — страница не делает повторных запросов).
import { redirect } from 'next/navigation';
import { currentOwner, signOutOwner } from '@/lib/owner-session';
import { PanelNav } from './_components/PanelNav';
import { ToastProvider } from './_components/Toast';
import { panelBase, SECTIONS, shiftHref } from './_lib/sections';
import { canReadMatrix } from '@/lib/sections';
import { resolveMatrix } from '@/lib/custom-roles';
import { PANEL_THEME_KEY, resolveAppearance } from '@/lib/appearance';
import { panelThemeStyle } from './_lib/panel-theme';
import { nicheOfTemplate } from '@/lib/business';
import { subscriptionAttention } from './_lib/subscription';

export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

export default async function OwnerLayout({ children, params }: { children: React.ReactNode; params: { prefix: string; slug: string } }) {
  const base = panelBase(params);
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${base}/login`);

  async function logout() {
    'use server';
    signOutOwner();
    redirect(`${base}/login`);
  }

  // Manager не получает пункты «Настройки», «Подписка», «Команда», «Данные» (ТЗ §13.10). Страницы и actions проверяют роль сами.
  // Отметка у «Подписки» — из уже загруженного бизнеса, без лишних запросов.
  const b = access.business;
  const niche = await nicheOfTemplate(b.vertical_template_id);
  const panelTheme = resolveAppearance(
    (b.custom_texts as Record<string, string> | null | undefined)?.[PANEL_THEME_KEY],
    niche,
  );
  const subscriptionBadge = subscriptionAttention(b.subscription_active, b.subscription_until, Date.now());
  // Меню строится по матрице прав: кастомная роль видит только разрешённые ей разделы.
  const navMatrix = await resolveMatrix(access.member.role, access.business.id);
  const items = SECTIONS.filter((s) => navMatrix && canReadMatrix(navMatrix, s.key))
    .map(({ key, path, label, eagerPrefetch }) => ({
      key, path, label, eagerPrefetch, badge: key === 'subscription' ? subscriptionBadge : null,
    }));

  return (
    <div className="panel-shell min-h-screen" style={panelThemeStyle(panelTheme, b.brand_color)} data-mode={panelTheme.mode}>
      <a href="#panel-main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:px-3 focus:py-2">
        К содержимому
      </a>
      <ToastProvider>
        <PanelNav
          base={base}
          businessName={access.business.name}
          items={items}
          logout={logout}
          shiftHref={shiftHref(access.role, params)}
        />
        <main id="panel-main" tabIndex={-1} className="mx-auto max-w-[1100px] px-4 py-6 outline-none">{children}</main>
      </ToastProvider>
    </div>
  );
}
