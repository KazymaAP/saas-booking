// _lib/sections.ts — разделы кабинета и правила видимости по ролям (ТЗ §13.9, §13.10).
// Чистый модуль: используется и сервером (layout, проверки), и клиентом (меню), и тестами.
import type { AdminUser } from '@/lib/database.types';

export type PanelParams = { prefix: string; slug: string };

export type SectionKey =
  | 'home' | 'bookings' | 'services' | 'photos' | 'texts'
  | 'notifications' | 'settings' | 'appearance' | 'subscription' | 'team' | 'data';

export type Section = {
  key: SectionKey;
  path: string; // относительный путь от /panel, '' — дашборд
  label: string;
  ownerOnly: boolean;
  // Полный prefetch данных: только для самых частых переходов, остальные — до loading.tsx.
  eagerPrefetch: boolean;
};

export const SECTIONS: readonly Section[] = [
  { key: 'home', path: '', label: 'Главная', ownerOnly: false, eagerPrefetch: true },
  { key: 'bookings', path: 'bookings', label: 'Брони', ownerOnly: false, eagerPrefetch: true },
  { key: 'services', path: 'services', label: 'Услуги', ownerOnly: false, eagerPrefetch: false },
  { key: 'photos', path: 'photos', label: 'Фото', ownerOnly: false, eagerPrefetch: false },
  { key: 'texts', path: 'texts', label: 'Тексты', ownerOnly: false, eagerPrefetch: false },
  { key: 'notifications', path: 'notifications', label: 'Уведомления', ownerOnly: false, eagerPrefetch: false },
  // Биллинг, настройки, команда и выгрузка ПД — только владелец (manager «без биллинга и настроек»).
  { key: 'settings', path: 'settings', label: 'Настройки', ownerOnly: true, eagerPrefetch: false },
  // Оформление вынесено в отдельный раздел: владелец меняет стиль кабинета и сайта,
  // не пролистывая длинную форму настроек (раньше блок был внизу «Настроек»).
  { key: 'appearance', path: 'appearance', label: 'Оформление', ownerOnly: true, eagerPrefetch: false },
  { key: 'subscription', path: 'subscription', label: 'Подписка', ownerOnly: true, eagerPrefetch: false },
  { key: 'team', path: 'team', label: 'Команда', ownerOnly: true, eagerPrefetch: false },
  { key: 'data', path: 'data', label: 'Данные', ownerOnly: true, eagerPrefetch: false },
];

// Пункт меню для клиента: badge — короткая отметка «требует внимания» (например, «скоро закончится»).
export type NavItem = Pick<Section, 'key' | 'path' | 'label' | 'eagerPrefetch'> & { badge?: string | null };

export function panelBase(params: PanelParams): string {
  return `/${params.prefix}/${params.slug}/panel`;
}

export function sectionHref(base: string, section: Pick<Section, 'path'>): string {
  return section.path ? `${base}/${section.path}` : base;
}

export function visibleSections(role: AdminUser['role']): Section[] {
  return SECTIONS.filter((s) => role === 'owner' || !s.ownerOnly);
}

// Активный пункт по текущему пути: дашборд — только точное совпадение, остальные — по префиксу.
export function isActiveSection(pathname: string, base: string, section: Pick<Section, 'path'>): boolean {
  const href = sectionHref(base, section);
  if (!section.path) return pathname === base || pathname === `${base}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}
