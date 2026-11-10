// общие/lib/sections.ts — разделы кабинета и матрица доступа встроенных ролей (единый источник правды для UI и actions).
import { BUILTIN_ROLES, type Role } from './auth-roles';

export type SectionKey =
  | 'home' | 'bookings' | 'services' | 'photos' | 'texts'
  | 'notifications' | 'settings' | 'appearance' | 'subscription' | 'team' | 'data';

export const SECTION_KEYS: readonly SectionKey[] = [
  'home', 'bookings', 'services', 'photos', 'texts',
  'notifications', 'settings', 'appearance', 'subscription', 'team', 'data',
];

export const SECTION_LABELS: Readonly<Record<SectionKey, string>> = {
  home: 'Главная', bookings: 'Брони', services: 'Услуги', photos: 'Фото', texts: 'Тексты',
  notifications: 'Уведомления', settings: 'Настройки', appearance: 'Оформление',
  subscription: 'Подписка', team: 'Команда', data: 'Данные',
};

export type SectionGrant = 'read' | 'write';
export type RoleMatrix = Readonly<Partial<Record<SectionKey, SectionGrant>>>;

const allWrite = (): RoleMatrix => Object.fromEntries(SECTION_KEYS.map((key) => [key, 'write'])) as RoleMatrix;
const allRead = (): RoleMatrix => Object.fromEntries(SECTION_KEYS.map((key) => [key, 'read'])) as RoleMatrix;

// Базовая матрица встроенных ролей. write подразумевает read.
export const ROLE_MATRIX: Readonly<Record<Role, RoleMatrix>> = {
  owner: allWrite(),
  manager: { home: 'write', bookings: 'write', services: 'write', photos: 'write', texts: 'write', notifications: 'write', settings: 'write', data: 'write' },
  receptionist: { home: 'read', bookings: 'write', notifications: 'write' },
  content: { services: 'write', photos: 'write', texts: 'write' },
  viewer: allRead(),
  finance: { home: 'read', subscription: 'read', data: 'write' },
  marketing: { texts: 'write', photos: 'write' },
  callcenter: { bookings: 'write', notifications: 'write' },
  analyst: { home: 'read', bookings: 'read', data: 'read' },
  photographer: { photos: 'write' },
  copywriter: { texts: 'write' },
  support: { bookings: 'read', notifications: 'write' },
  auditor: { ...allRead(), data: 'write' },
  intern: allRead(),
};

// Дополнительные ограничения, которые не выражаются разделом целиком.
export const ROLE_FLAGS: Readonly<Record<Role, { readonly pii: boolean; readonly dataExport: boolean; readonly supportTickets: boolean }>> = {
  owner: { pii: true, dataExport: true, supportTickets: true },
  manager: { pii: true, dataExport: true, supportTickets: true },
  receptionist: { pii: true, dataExport: false, supportTickets: true },
  content: { pii: false, dataExport: false, supportTickets: false },
  viewer: { pii: false, dataExport: false, supportTickets: false },
  finance: { pii: false, dataExport: true, supportTickets: false },
  marketing: { pii: false, dataExport: false, supportTickets: false },
  callcenter: { pii: false, dataExport: false, supportTickets: false },
  analyst: { pii: false, dataExport: false, supportTickets: false },
  photographer: { pii: false, dataExport: false, supportTickets: false },
  copywriter: { pii: false, dataExport: false, supportTickets: false },
  support: { pii: false, dataExport: false, supportTickets: true },
  auditor: { pii: false, dataExport: true, supportTickets: false },
  intern: { pii: false, dataExport: false, supportTickets: false },
};

// Разделы, недоступные manager (по базовой матрице).
export const OWNER_ONLY_SECTIONS = ['subscription', 'team', 'appearance'] as const;

export function sectionAllowed(role: Role, section: string): boolean {
  return canRead(role, (section || 'home') as SectionKey);
}

export function isBuiltinRole(value: string): value is Role {
  return (BUILTIN_ROLES as readonly string[]).includes(value);
}

export function canRead(role: Role, section: SectionKey): boolean {
  return ROLE_MATRIX[role][section] !== undefined;
}

export function canWrite(role: Role, section: SectionKey): boolean {
  return ROLE_MATRIX[role][section] === 'write';
}

// Разделы, видимые роли в меню.
export function sectionsForRole(role: Role): readonly SectionKey[] {
  return SECTION_KEYS.filter((key) => canRead(role, key));
}
