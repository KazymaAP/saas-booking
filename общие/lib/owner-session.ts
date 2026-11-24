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
import { customRoleId, isCustomRole } from './sections';
import { isSuperAdminEmail } from './admin-session';
import { copyPath, inCopyMode } from './copy-mode';
import type { AdminUser, Business } from './database.types';

export const OWNER_COOKIE = cookieNames('owner').access;

// Кабинет открыт только оплатившим клиентам (ТЗ §5.3, §19). Остальные статусы — «кабинет недоступен».
const ACTIVE_BUSINESS_STATUS = 'client';

export type { OwnerRole } from './auth-roles';
import { isRole, type OwnerRole, type Role } from './auth-roles';
// adminUser и role добавлены для матрицы прав; member сохранён для совместимости с существующими вызовами.
export type OwnerAccessData = { business: Business; member: AdminUser; adminUser: AdminUser; role: Role | null };
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
  return { kind: 'member', data: { business, member, adminUser: member, role: isRole(member.role) ? member.role : null } };
}

// Режим поддержки: супер-админ открывает кабинет любого бизнеса, даже если он не в admin_users.
// Нужно для эксплуатации платформы: у сгенерированных сайтов владельца ещё нет, а проверить кабинет надо.
// Доступ даёт только действующая сессия супер-админа (SUPERADMIN_EMAILS), поэтому арендаторам это не открывает.
export async function superAdminSupportAccess(slug: string): Promise<OwnerAccessData | null> {
  const state = await readSession('admin');
  if (state.kind !== 'active' || !isSuperAdminEmail(state.claims.email)) return null;
  const { data: business } = await adminClient()
    .from('businesses').select('*').eq('slug', slug).maybeSingle<Business>();
  if (!business) return null;
  const now = new Date().toISOString();
  const member: AdminUser = {
    id: `superadmin:${business.id}`,
    business_id: business.id,
    auth_user_id: state.claims.sub,
    email: state.claims.email,
    name: 'Супер-админ (поддержка)',
    phone: null,
    role: 'owner',
    status: 'active',
    invited_at: null,
    invited_by: null,
    last_login: null,
    // Поддержка платформы пароль не меняет — иначе супер-админа уводило бы на форму смены пароля.
    must_change_password: false,
    created_at: now,
    updated_at: now,
  };
  return { business, member, adminUser: member, role: 'owner' };
}

// Режим копии (временный раздел /test/ful/sts): кабинет открывается без входа.
// Роль берём из адреса, если это страница сотрудника (/d/slug/receptionist), иначе — владелец:
// страница сотрудника сверяет роль из URL с ролью доступа и без этого отдала бы 404.
export async function copyAccess(slug: string): Promise<OwnerAccessData | null> {
  const { data: business } = await adminClient()
    .from('businesses').select('*').eq('slug', slug).maybeSingle<Business>();
  if (!business) return null;
  const now = new Date().toISOString();
  const requested = /^\/[^/]+\/[^/]+\/([a-z]+)\/?$/.exec(copyPath())?.[1] ?? '';
  const role: Role = isRole(requested) && requested !== 'owner' ? requested : 'owner';
  const member: AdminUser = {
    id: `copy:${business.id}`,
    business_id: business.id,
    auth_user_id: `copy:${business.id}`,
    email: `copy@${business.slug}.panel.zapishisya.ru`,
    name: 'Копия страницы',
    phone: null,
    role,
    status: 'active',
    invited_at: null,
    invited_by: null,
    last_login: null,
    must_change_password: false,
    created_at: now,
    updated_at: now,
  };
  return { business, member, adminUser: member, role };
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
  const business = membership.data.business;
  const role = membership.data.member.role;
  // П3: кастомная роль удалена владельцем → вход запрещён, пользователь видит ?error=role_removed.
  if (isCustomRole(role)) {
    const cid = customRoleId(role);
    if (cid) {
      const { data: roleRow, error: roleError } = await adminClient()
        .from('business_custom_roles').select('id').eq('id', cid).eq('business_id', business.id).maybeSingle();
      if (roleError || !roleRow) {
        await authEvent('login_failed', { realm: 'owner', email: session.user.email, ip, reason: 'role_removed', businessId: business.id });
        return 'role_removed';
      }
    }
  }
  startSession('owner', session);
  await authEvent('login_success', { realm: 'owner', email: session.user.email, ip, businessId: business.id });
  // Отметка входа: без неё в супер-админке не видно, пользуется ли клиент кабинетом вообще.
  // Best-effort — сбой записи не должен ломать вход.
  await Promise.resolve(
    adminClient().from('admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', membership.data.member.id),
  ).catch(() => undefined);
  // П1: фиксируем использование кастомной роли и снимаем флаг предупреждения об удалении.
  // Если роль «ожила» (сотрудник снова вошёл), отсчёт 30 дней неактивности начинается заново.
  if (isCustomRole(role)) {
    const cid = customRoleId(role);
    if (cid) {
      // best-effort: «оживление» роли — сбрасываем отсчёт неактивности и флаг предупреждения.
      await Promise.resolve(
        adminClient().from('business_custom_roles')
          .update({ last_used_at: new Date().toISOString(), removal_notified_at: null })
          .eq('id', cid).eq('business_id', business.id),
      ).catch(() => undefined);
    }
  }
  return 'ok';
}

// Логин кабинета. Supabase Auth знает только email, поэтому короткий логин разворачивается
// во внутренний адрес этого же кабинета: «admin» на /d/vippro/admin → admin@vippro.panel.zapishisya.ru.
// Адрес уникален для пары (логин, кабинет), письма на него не отправляются.
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

export function resolveOwnerLogin(raw: unknown, slug: string): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value.includes('@')) return normalizeEmail(value);
  if (!LOGIN_RE.test(value) || !SLUG_RE.test(slug)) return null;
  return `${value}@${slug}.panel.zapishisya.ru`;
}

export async function signInOwner(rawEmail: string, password: string, slug: string): Promise<SignInResult> {
  const ctx = requestContext();
  if (!ctx.sameOrigin) {
    await authEvent('csrf_rejected', { realm: 'owner', ip: ctx.ip });
    return 'forbidden_origin';
  }
  const email = resolveOwnerLogin(rawEmail, slug);
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
  // Копия страницы (/test/ful/sts): кабинет и формы смены пароля работают без сессии.
  if (inCopyMode()) {
    const copy = await copyAccess(slug);
    return copy ? { kind: 'ok', data: copy } : { kind: 'none' };
  }
  const state = await readSession('owner');
  if (state.kind === 'refresh_needed') return { kind: 'refresh' };
  if (state.kind === 'none') {
    // Сессии владельца нет — но супер-админ может открыть кабинет в режиме поддержки.
    const support = await superAdminSupportAccess(slug);
    return support ? { kind: 'ok', data: support } : { kind: 'none' };
  }
  const membership = await findMembership(state.claims.sub, slug);
  if (membership.kind === 'none') {
    const support = await superAdminSupportAccess(slug);
    return support ? { kind: 'ok', data: support } : { kind: 'none' };
  }
  if (membership.kind === 'inactive') {
    // Приостановленный бизнес: владельцу кабинет закрыт, супер-админу в режиме поддержки — открыт.
    // Так же ведёт себя currentOwner, иначе layout и login-страница разошлись бы в решении.
    const support = await superAdminSupportAccess(slug);
    return support ? { kind: 'ok', data: support } : { kind: 'inactive' };
  }
  return state.refreshSoon ? { kind: 'refresh' } : { kind: 'ok', data: membership.data };
}

// Состояние доступа для layout кабинета. Кэш в рамках запроса.
export const ownerAccess = cache(ownerAccessUncached);

async function currentOwnerUncached(slug: string): Promise<OwnerAccessData | null> {
  if (inCopyMode()) return copyAccess(slug);
  const state = await readSession('owner');
  if (state.kind !== 'active') return superAdminSupportAccess(slug);
  const membership = await findMembership(state.claims.sub, slug);
  if (membership.kind === 'member') return membership.data;
  return superAdminSupportAccess(slug);
}

// Бизнес и роль текущего пользователя или null. Кэш в рамках запроса: layout и страница не дублируют запросы.
export const currentOwner = cache(currentOwnerUncached);

// Для Server Actions кабинета: Origin, при необходимости обновление сессии, проверка роли.
// Server Action — отдельный POST-эндпоинт: проверка в layout его не защищает.
export async function requireOwnerAction(slug: string, roles: readonly OwnerRole[] = ['owner', 'manager']): Promise<OwnerAccessData | null> {
  if (inCopyMode()) {
    const copy = await copyAccess(slug);
    return copy && copy.role !== null && roles.includes(copy.role as OwnerRole) ? copy : null;
  }
  if (!requestContext().sameOrigin) return null;
  let access = await currentOwner(slug);
  if (!access) {
    const refreshed = await refreshSession('owner');
    if (refreshed) {
      const membership = await findMembership(refreshed.user.id, slug);
      access = membership.kind === 'member' ? membership.data : null;
    }
  }
  if (!access) access = await superAdminSupportAccess(slug);
  return access && access.role !== null && roles.includes(access.role) ? access : null;
}

export type OwnerPanelInfo = { readonly name: string; readonly canonicalPrefix: string };

// Существует ли кабинет по адресу /{prefix}/{slug}/admin: бизнес со slug и шаблоном с этим url_prefix.
// Статус не раскрывается: форма входа одинакова для активных и неактивных бизнесов.
//
// Префикс возвращается канонический, а не проверяется на равенство: при переезде бизнеса в другую
// нишу старый адрес кабинета отдавал 404, хотя публичный сайт уже редиректил. Страница входа сама
// сделает 308, если префикс в адресе не тот.
async function ownerPanelInfoUncached(slug: string): Promise<OwnerPanelInfo | null> {
  const db = adminClient();
  const { data: business } = await db.from('businesses').select('name, vertical_template_id').eq('slug', slug)
    .maybeSingle<{ name: string; vertical_template_id: string | null }>();
  if (!business?.vertical_template_id) return null;
  const { data: template } = await db.from('vertical_templates').select('url_prefix').eq('id', business.vertical_template_id)
    .maybeSingle<{ url_prefix: string }>();
  const canonicalPrefix = (template?.url_prefix ?? '').trim();
  if (!canonicalPrefix) return null;
  return { name: business.name, canonicalPrefix };
}

export const ownerPanelInfo = cache(ownerPanelInfoUncached);

export async function signOutOwner(): Promise<void> {
  await endSession('owner');
  await authEvent('logout', { realm: 'owner', ip: requestContext().ip });
}

export const signIn = signInOwner;
export const signOut = signOutOwner;
