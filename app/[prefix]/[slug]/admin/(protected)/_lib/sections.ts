// app/[prefix]/[slug]/admin/(protected)/_lib/sections.ts — разделы кабинета и правила видимости по ролям.
// Чистый модуль: используется и сервером (layout, проверки), и клиентом (меню), и тестами.
// Матрица прав — единый источник истины в общие/lib/sections.ts.
import { BUILTIN_ROLES, isRole, type Role } from '@/lib/auth-roles';
import { canRead, SECTION_KEYS, SECTION_LABELS, type SectionKey } from '@/lib/sections';

export type PanelParams = { prefix: string; slug: string };

export type { SectionKey } from '@/lib/sections';

export type Section = {
  key: SectionKey;
  path: string; // относительный путь от /admin, '' — дашборд
  label: string;
  roles: readonly Role[];
  // Полный prefetch данных: только для самых частых переходов, остальные — до loading.tsx.
  eagerPrefetch: boolean;
};

const PATHS: Readonly<Record<SectionKey, string>> = {
  home: '', bookings: 'bookings', services: 'services', photos: 'photos', texts: 'texts',
  notifications: 'notifications', settings: 'settings', appearance: 'appearance',
  subscription: 'subscription', team: 'team', data: 'data',
};

// Раздел виден, если роль есть в списке (список строится из матрицы прав).
export const SECTIONS: readonly Section[] = SECTION_KEYS.map((key) => ({
  key,
  path: PATHS[key],
  label: SECTION_LABELS[key],
  roles: BUILTIN_ROLES.filter((role) => canRead(role, key)),
  eagerPrefetch: key === 'home' || key === 'bookings',
}));

// Пункт меню для клиента: badge — короткая отметка «требует внимания» (например, «скоро закончится»).
export type NavItem = Pick<Section, 'key' | 'path' | 'label' | 'eagerPrefetch'> & { badge?: string | null };

export function panelBase(params: PanelParams): string {
  return `/${params.prefix}/${params.slug}/admin`;
}

export function sectionHref(base: string, section: Pick<Section, 'path'>): string {
  return section.path ? `${base}/${section.path}` : base;
}

// Роль приходит из БД как text: неизвестное значение не получает ни одного раздела.
export function visibleSections(role: string): Section[] {
  const known: Role | null = isRole(role) ? role : null;
  return known ? SECTIONS.filter((s) => s.roles.includes(known)) : [];
}

// Активный пункт по текущему пути: дашборд — только точное совпадение, остальные — по префиксу.
export function isActiveSection(pathname: string, base: string, section: Pick<Section, 'path'>): boolean {
  const href = sectionHref(base, section);
  if (!section.path) return pathname === base || pathname === `${base}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}
