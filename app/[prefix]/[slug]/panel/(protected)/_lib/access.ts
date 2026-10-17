// _lib/access.ts — проверка доступа к кабинету для страниц и server actions (ТЗ §5.2, §13.10).
// Папка с «_» не становится маршрутом. Модуль только серверный: зависит от cookies через currentOwner
// (next/headers сам упадёт при импорте в клиентский компонент).
import { notFound, redirect } from 'next/navigation';
import { currentOwner } from '@/lib/owner-session';
import type { AdminUser, Business } from '@/lib/database.types';
import type { PanelParams } from './sections';
import { panelBase } from './sections';

export type OwnerAccess = { business: Business; member: AdminUser };
export type Role = AdminUser['role'];

export function isOwner(access: OwnerAccess): boolean {
  return access.member.role === 'owner';
}

// Для страниц: без сессии — на логин; не та роль — 404, чтобы manager не узнал о существовании раздела.
// layout уже проверил сессию, но страница может отрендериться параллельно — проверяем сами (запрос кэширован).
export async function requirePageAccess(params: PanelParams, roles: readonly Role[] = ['owner', 'manager']): Promise<OwnerAccess> {
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${panelBase(params)}/login`);
  if (!roles.includes(access.member.role)) notFound();
  return access;
}

// Для actions: без редиректов, чтобы клиент получил понятную ошибку и откатил optimistic-состояние.
export async function actionAccess(slug: string, roles: readonly Role[] = ['owner', 'manager']): Promise<OwnerAccess | null> {
  const access = await currentOwner(slug);
  if (!access || !roles.includes(access.member.role)) return null;
  return access;
}

export const OWNER_ONLY: readonly Role[] = ['owner'];
