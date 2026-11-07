// lib/auth-roles.ts — права ролей кабинета (ТЗ §5.2). Чистые функции, покрыты unit-тестами.
// owner — полный доступ к своему бизнесу; manager — брони и просмотр, без биллинга, настроек и команды.
import { panelRootOf } from './auth-core';
import type { AdminUser } from './database.types';

export type OwnerRole = AdminUser['role'];

// Роль в родительном падеже: «с правами владельца» — для письма-приглашения и страницы /invite.
export const ROLE_GENITIVE: Readonly<Record<OwnerRole, string>> = { owner: 'владельца', manager: 'менеджера' };

// Разделы, закрытые для manager (ТЗ §5.2: «без биллинга и настроек»; команду ведёт owner, ТЗ §5.6).
export const OWNER_ONLY_SECTIONS = ['settings', 'subscription', 'team'] as const;

export function sectionAllowed(role: OwnerRole, section: string): boolean {
  return role === 'owner' || !(OWNER_ONLY_SECTIONS as readonly string[]).includes(section);
}

// Раздел кабинета по пути: '/s/tire/panel/settings/x' → 'settings'; '' — главная; null — путь не из кабинета.
export function sectionOf(path: string | null): string | null {
  if (!path) return null;
  const clean = path.split(/[?#]/)[0] ?? '';
  const root = panelRootOf(clean);
  if (!root) return null;
  return clean.slice(root.length).split('/').filter(Boolean)[0] ?? '';
}
