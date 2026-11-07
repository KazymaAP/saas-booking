// app/[prefix]/[slug]/panel/(protected)/layout.tsx — кабинет владельца: проверка доступа и навигация (ТЗ §13.9–13.11).
// Серверный: доступ проверяется по БД на каждом запросе (currentOwner кэширован на запрос — страница не делает повторных запросов).
import { redirect } from 'next/navigation';
import { currentOwner, signOutOwner } from '@/lib/owner-session';
import { PanelNav } from './_components/PanelNav';
import { ToastProvider } from './_components/Toast';
import { panelBase, visibleSections } from './_lib/sections';
import { accentColor } from './_lib/color';
import { PANEL_THEME_KEY, appearanceVars, resolveAppearance } from '@/lib/appearance';
import { nicheOfTemplate } from '@/lib/business';
import { subscriptionAttention } from './_lib/subscription';

export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

// Оформление кабинета: по умолчанию — стиль ниши бизнеса (как его сайт), в настройках можно выбрать
// любой из 10 стилей. Акцент остаётся фирменным цветом бизнеса, если он задан (design-spec §5),
// иначе берётся акцент стиля. accentColor() гарантирует контраст 4.5:1 с белым текстом кнопок.
type ThemeStyle = React.CSSProperties & Record<`--${string}`, string>;
function panelThemeStyle(theme: ReturnType<typeof resolveAppearance>, brandColor: string | null): ThemeStyle {
  const vars = appearanceVars(theme);
  return { ...vars, '--brand-color': accentColor(brandColor) || vars['--brand-color'] };
}

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
  const items = visibleSections(access.member.role).map(({ key, path, label, eagerPrefetch }) => ({
    key, path, label, eagerPrefetch, badge: key === 'subscription' ? subscriptionBadge : null,
  }));

  return (
    <div className="panel-shell min-h-screen" style={panelThemeStyle(panelTheme, b.brand_color)} data-mode={panelTheme.mode}>
      <a href="#panel-main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:px-3 focus:py-2">
        К содержимому
      </a>
      <ToastProvider>
        <PanelNav base={base} businessName={access.business.name} items={items} logout={logout} />
        <main id="panel-main" tabIndex={-1} className="mx-auto max-w-[1100px] px-4 py-6 outline-none">{children}</main>
      </ToastProvider>
    </div>
  );
}
