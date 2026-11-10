// общие/lib/auth-roles.ts — встроенные роли сотрудников бизнеса и разбор раздела из пути кабинета.
// Чистый модуль без внешних зависимостей: матрица прав лежит в sections.ts.
import { panelRootOf } from './auth-core';

export const BUILTIN_ROLES = [
  'owner', 'manager', 'receptionist', 'content', 'viewer', 'finance',
  'marketing', 'callcenter', 'analyst', 'photographer', 'copywriter',
  'support', 'auditor', 'intern',
] as const;

export type Role = (typeof BUILTIN_ROLES)[number];

// Старое имя типа сохранено для совместимости с вызывающими модулями.
export type OwnerRole = Role;

// Индексация строкой: роль приходит из БД как text и может быть кастомной (шаг 5).
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  owner: 'Владелец', manager: 'Менеджер', receptionist: 'Администратор', content: 'Контент-менеджер',
  viewer: 'Наблюдатель', finance: 'Финансист', marketing: 'Маркетолог', callcenter: 'Колл-центр',
  analyst: 'Аналитик', photographer: 'Фотограф', copywriter: 'Копирайтер', support: 'Поддержка',
  auditor: 'Аудитор', intern: 'Стажёр',
};

// Роль в родительном падеже: «с правами владельца» — для письма-приглашения и страницы /invite.
export const ROLE_GENITIVE: Readonly<Record<string, string>> = {
  owner: 'владельца', manager: 'менеджера', receptionist: 'администратора', content: 'контент-менеджера',
  viewer: 'наблюдателя', finance: 'финансиста', marketing: 'маркетолога', callcenter: 'оператора колл-центра',
  analyst: 'аналитика', photographer: 'фотографа', copywriter: 'копирайтера', support: 'специалиста поддержки',
  auditor: 'аудитора', intern: 'стажёра',
};

// Все роли, кроме owner, — сотрудники: их вход ведёт на /{prefix}/{slug}/{role}.
export const STAFF_ROLES: readonly Role[] = BUILTIN_ROLES.filter((role) => role !== 'owner');

export function isRole(value: string): value is Role {
  return (BUILTIN_ROLES as readonly string[]).includes(value);
}

// Раздел кабинета по пути: '/s/tire/admin/settings/x' → 'settings'; '' — главная; null — путь не из кабинета.
export function sectionOf(path: string | null): string | null {
  if (!path) return null;
  const clean = path.split(/[?#]/)[0] ?? '';
  const root = panelRootOf(clean);
  if (!root) return null;
  return clean.slice(root.length).split('/').filter(Boolean)[0] ?? '';
}
