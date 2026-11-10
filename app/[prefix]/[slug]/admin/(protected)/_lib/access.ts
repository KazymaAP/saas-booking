// app/[prefix]/[slug]/admin/(protected)/_lib/access.ts — проверка доступа к кабинету для страниц и server actions.
// Папка с «_» не становится маршрутом. Модуль только серверный: зависит от cookies через currentOwner
// (next/headers сам упадёт при импорте в клиентский компонент).
import { notFound, redirect } from 'next/navigation';
import { currentOwner } from '@/lib/owner-session';
import { BUILTIN_ROLES, isRole, type Role } from '@/lib/auth-roles';
import { canRead, canWrite, type SectionKey } from '@/lib/sections';
import type { AdminUser, Business } from '@/lib/database.types';
import type { PanelParams } from './sections';
import { panelBase } from './sections';

export type OwnerAccess = { business: Business; member: AdminUser };
export type { Role };

export function isOwner(access: OwnerAccess): boolean {
  return access.member.role === 'owner';
}

function roleOf(access: OwnerAccess): Role | null {
  const role = access.member.role;
  return role && isRole(role) ? role : null;
}

// Для страниц: без сессии — на логин; не та роль — 404, чтобы сотрудник не узнал о существовании раздела.
export async function requirePageAccess(params: PanelParams, roles: readonly Role[] = BUILTIN_ROLES): Promise<OwnerAccess> {
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${panelBase(params)}/login`);
  const role = roleOf(access);
  if (!role || !roles.includes(role)) notFound();
  return access;
}

// Страница раздела: доступ по матрице read.
export async function requireSectionAccess(params: PanelParams, section: SectionKey): Promise<OwnerAccess> {
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${panelBase(params)}/login`);
  const role = roleOf(access);
  if (!role || !canRead(role, section)) notFound();
  return access;
}

// Для actions: без редиректов, чтобы клиент получил понятную ошибку и откатил optimistic-состояние.
// По умолчанию — все встроенные роли; точная проверка прав делается через writeAccess.
export async function actionAccess(slug: string, roles: readonly Role[] = BUILTIN_ROLES): Promise<OwnerAccess | null> {
  const access = await currentOwner(slug);
  const role = access ? roleOf(access) : null;
  return access && role && roles.includes(role) ? access : null;
}

// Меняющее action раздела: пропускает только роли с правом write на этот раздел.
export async function writeAccess(slug: string, section: SectionKey): Promise<OwnerAccess | null> {
  const access = await currentOwner(slug);
  const role = access ? roleOf(access) : null;
  return access && role && canWrite(role, section) ? access : null;
}

export const OWNER_ONLY: readonly Role[] = ['owner'];
