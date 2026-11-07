// lib/owner-session.ts — сессия владельца/менеджера бизнеса (ТЗ §5.2, §5.3, §5.8).
// Email + пароль; права проверяются на каждом запросе по БД: пользователь должен быть в admin_users
// этого бизнеса (owner или manager), а бизнес — в статусе client. Cookie одна на хост (host-only).
import { cache } from './react-cache';
import { adminClient } from './supabase';
import { normalizeEmail, type SignInResult } from './auth-core';
import { requestContext } from './auth-request';
import { allowAll } from './auth-rate';
import { authEvent } from './auth-audit';
import { passwordSignIn, type ProviderSession } from './auth-provider';
import { endSession, readSession, refreshSession, startSession } from './auth-session';
import { cookieNames } from './auth-cookies';
import type { AdminUser, Business } from './database.types';

export const OWNER_COOKIE = cookieNames('owner').access;

// Кабинет открыт только оплатившим клиентам (ТЗ §5.3, §19). Остальные статусы — «кабинет недоступен».
const ACTIVE_BUSINESS_STATUS = 'client';

export type { OwnerRole } from './auth-roles';
import type { OwnerRole } from './auth-roles';
export type OwnerAccessData = { business: Business; member: AdminUser };
export type Membership =
  | { readonly kind: 'member'; readonly data: OwnerAccessData }
  | { readonly kind: 'inactive'; readonly businessId: string }
  | { readonly kind: 'none' };

// Членство пользователя в бизнесе по slug. Один запрос за бизнесом, один — за членством.
export async function findMembership(userId: string, slug: string): Promise<Membership> {
  const db = adminClient();
  const { data: business } = await db.from('businesses').select('*').eq('slug', slug).maybeSingle<Business>();
  if (!business) return { kind: 'none' };
  const { data: member } = await db
    .from('admin_users').select('*')
    .eq('business_id', business.id).eq('auth_user_id', userId)
    .maybeSingle<AdminUser>();
  if (!member) return { kind: 'none' };
  if (business.status !== ACTIVE_BUSINESS_STATUS) return { kind: 'inactive', businessId: business.id };
  return { kind: 'member', data: { business, member } };
}

// Общая часть входа по паролю и по magic-link: проверка членства и выдача cookie.
export async function completeOwnerSignIn(session: ProviderSession, slug: string, ip: string): Promise<SignInResult> {
  const membership = await findMembership(session.user.id, slug);
  if (membership.kind === 'none') {
    await authEvent('login_failed', { realm: 'owner', email: session.user.email, ip, reason: 'not_member' });
    return 'invalid';
  }
  if (membership.kind === 'inactive') {
    await authEvent('login_failed', { realm: 'owner', email: session.user.email, ip, reason: 'inactive', businessId: membership.businessId });
    return 'inactive';
  }
  startSession('owner', session);
  await authEvent('login_success', { realm: 'owner', email: session.user.email, ip, businessId: membership.data.business.id });
  return 'ok';
}

export async function signInOwner(rawEmail: string, password: string, slug: string): Promise<SignInResult> {
  const ctx = requestContext();
  if (!ctx.sameOrigin) {
    await authEvent('csrf_rejected', { realm: 'owner', ip: ctx.ip });
    return 'forbidden_origin';
  }
  const email = normalizeEmail(rawEmail);
  const allowed = await allowAll([['login_ip', ctx.ip], ['login_email', email ?? rawEmail]]);
  if (!allowed) {
    await authEvent('login_rate_limited', { realm: 'owner', email, ip: ctx.ip });
    return 'rate_limited';
  }
  if (!email || password.length === 0) {
    await authEvent('login_failed', { realm: 'owner', ip: ctx.ip, reason: 'malformed' });
    return 'invalid';
  }
  const session = await passwordSignIn(email, password);
  if (!session) {
    await authEvent('login_failed', { realm: 'owner', email, ip: ctx.ip, reason: 'bad_credentials' });
    return 'invalid';
  }
  return completeOwnerSignIn(session, slug, ctx.ip);
}

export type OwnerAccess =
  | { readonly kind: 'ok'; readonly data: OwnerAccessData }
  | { readonly kind: 'refresh' }
  | { readonly kind: 'inactive' }
  | { readonly kind: 'none' };

async function ownerAccessUncached(slug: string): Promise<OwnerAccess> {
  const state = await readSession('owner');
  if (state.kind === 'refresh_needed') return { kind: 'refresh' };
  if (state.kind === 'none') return { kind: 'none' };
  const membership = await findMembership(state.claims.sub, slug);
  if (membership.kind === 'none') return { kind: 'none' };
  if (membership.kind === 'inactive') return { kind: 'inactive' };
  return state.refreshSoon ? { kind: 'refresh' } : { kind: 'ok', data: membership.data };
}

// Состояние доступа для layout кабинета. Кэш в рамках запроса.
export const ownerAccess = cache(ownerAccessUncached);

async function currentOwnerUncached(slug: string): Promise<OwnerAccessData | null> {
  const state = await readSession('owner');
  if (state.kind !== 'active') return null;
  const membership = await findMembership(state.claims.sub, slug);
  return membership.kind === 'member' ? membership.data : null;
}

// Бизнес и роль текущего пользователя или null. Кэш в рамках запроса: layout и страница не дублируют запросы.
export const currentOwner = cache(currentOwnerUncached);

// Для Server Actions кабинета: Origin, при необходимости обновление сессии, проверка роли.
// Server Action — отдельный POST-эндпоинт: проверка в layout его не защищает.
export async function requireOwnerAction(slug: string, roles: readonly OwnerRole[] = ['owner', 'manager']): Promise<OwnerAccessData | null> {
  if (!requestContext().sameOrigin) return null;
  let access = await currentOwner(slug);
  if (!access) {
    const refreshed = await refreshSession('owner');
    if (!refreshed) return null;
    const membership = await findMembership(refreshed.user.id, slug);
    access = membership.kind === 'member' ? membership.data : null;
  }
  return access && roles.includes(access.member.role) ? access : null;
}

export type OwnerPanelInfo = { readonly name: string };

// Существует ли кабинет по адресу /{prefix}/{slug}/panel: бизнес со slug и шаблоном с этим url_prefix.
// Статус не раскрывается: форма входа одинакова для активных и неактивных бизнесов.
async function ownerPanelInfoUncached(prefix: string, slug: string): Promise<OwnerPanelInfo | null> {
  const db = adminClient();
  const { data: business } = await db.from('businesses').select('name, vertical_template_id').eq('slug', slug)
    .maybeSingle<{ name: string; vertical_template_id: string | null }>();
  if (!business?.vertical_template_id) return null;
  const { data: template } = await db.from('vertical_templates').select('url_prefix').eq('id', business.vertical_template_id)
    .maybeSingle<{ url_prefix: string }>();
  return template?.url_prefix === prefix ? { name: business.name } : null;
}

export const ownerPanelInfo = cache(ownerPanelInfoUncached);

export async function signOutOwner(): Promise<void> {
  await endSession('owner');
  await authEvent('logout', { realm: 'owner', ip: requestContext().ip });
}

export const signIn = signInOwner;
export const signOut = signOutOwner;
