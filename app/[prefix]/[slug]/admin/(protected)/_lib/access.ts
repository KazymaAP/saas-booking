// app/[prefix]/[slug]/admin/(protected)/_lib/access.ts — проверка доступа к кабинету для страниц и server actions.
// Папка с «_» не становится маршрутом. Модуль только серверный: зависит от cookies через currentOwner
// (next/headers сам упадёт при импорте в клиентский компонент).
import { notFound, redirect } from 'next/navigation';
import { currentOwner } from '@/lib/owner-session';
import { BUILTIN_ROLES, isRole, type Role } from '@/lib/auth-roles';
import { canReadMatrix, canWriteMatrix, type RoleMatrix, type SectionKey } from '@/lib/sections';
import { resolveMatrix } from '@/lib/custom-roles';
import type { AdminUser, Business } from '@/lib/database.types';
import type { PanelParams } from './sections';
import { panelBase } from './sections';

export type OwnerAccess = { business: Business; member: AdminUser };
export type { Role };

export function isOwner(access: OwnerAccess): boolean {
  return access.member.role === 'owner';
}

// Матрица доступа текущего участника (встроенная или кастомная). null — неизвестная/удалённая роль.
async function matrixOf(access: OwnerAccess): Promise<RoleMatrix | null> {
  const role = access.member.role;
  if (!role) return null;
  return resolveMatrix(role, access.business.id);
}

// Для страниц: без сессии — на логин; нет матрицы прав — 404, чтобы сотрудник не узнал о существовании раздела.
// Явно заданный список roles ограничивает доступ ВСТРОЕННЫМИ ролями; кастомные роли проходят при наличии матрицы
// (точная проверка по разделам — в requireSectionAccess).
export async function requirePageAccess(params: PanelParams, roles: readonly Role[] = BUILTIN_ROLES): Promise<OwnerAccess> {
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${panelBase(params)}/login`);
  const matrix = await matrixOf(access);
  if (!matrix) notFound();
  const role = access.member.role;
  if (role && isRole(role) && roles.length > 0 && !roles.includes(role)) notFound();
  return access;
}

// Страница раздела: доступ по матрице read.
export async function requireSectionAccess(params: PanelParams, section: SectionKey): Promise<OwnerAccess> {
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${panelBase(params)}/login`);
  const matrix = await matrixOf(access);
  if (!matrix || !canReadMatrix(matrix, section)) notFound();
  return access;
}

// Для actions: без редиректов, чтобы клиент получил понятную ошибку и откатил optimistic-состояние.
// По умолчанию — любой участник с разрешённой матрицей; точная проверка прав делается через writeAccess.
export async function actionAccess(slug: string, roles: readonly Role[] = BUILTIN_ROLES): Promise<OwnerAccess | null> {
  const access = await currentOwner(slug);
  if (!access) return null;
  const matrix = await matrixOf(access);
  if (!matrix) return null;
  const role = access.member.role;
  if (role && isRole(role) && roles.length > 0 && !roles.includes(role)) return null;
  return access;
}

// Меняющее action раздела: пропускает только роли с правом write на этот раздел.
export async function writeAccess(slug: string, section: SectionKey): Promise<OwnerAccess | null> {
  const access = await currentOwner(slug);
  if (!access) return null;
  const matrix = await matrixOf(access);
  return access && matrix && canWriteMatrix(matrix, section) ? access : null;
}

export const OWNER_ONLY: readonly Role[] = ['owner'];
