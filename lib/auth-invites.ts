// lib/auth-invites.ts — приглашения в кабинет бизнеса (ТЗ §4.12, §5.6).
// Owner (или супер-админ для первого владельца) → admin_invites → письмо со ссылкой /invite/{token}.
// TTL 7 дней, одноразовое, привязано к business_id + email + role. В колонке token хранится дайджест
// (uuid-формат), сам токен есть только в письме. Принятие: задать пароль → admin_users → вход в кабинет.
import { adminClient } from './supabase';
import {
  checkPassword, expiresAt, generateToken, INVITE_TTL_SECONDS, isUuidV4, normalizeEmail, tokenDigest, tokenState,
  type TokenState,
} from './auth-core';
import { allowRate } from './auth-rate';
import { authEvent } from './auth-audit';
import { deliver, inviteMail } from './auth-mail';
import { createUserWithPassword, passwordSignIn, type ProviderSession } from './auth-provider';
import { startSession } from './auth-session';

export type InviteRole = 'owner' | 'manager';

export type InviteRecord = {
  readonly id: string;
  readonly business_id: string;
  readonly email: string;
  readonly role: InviteRole;
  readonly expires_at: string;
  readonly used_at: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
};

type BusinessInfo = { readonly id: string; readonly name: string; readonly slug: string; readonly prefix: string | null };

const TABLE = 'admin_invites';
// id строк генерирует gen_random_uuid() — формат uuid, версия не проверяется.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isInviteRole(value: unknown): value is InviteRole {
  return value === 'owner' || value === 'manager';
}

async function businessInfo(businessId: string): Promise<BusinessInfo | null> {
  const db = adminClient();
  const { data } = await db.from('businesses').select('id, name, slug, vertical_template_id').eq('id', businessId)
    .maybeSingle<{ id: string; name: string; slug: string; vertical_template_id: string | null }>();
  if (!data) return null;
  let prefix: string | null = null;
  if (data.vertical_template_id) {
    const { data: tpl } = await db.from('vertical_templates').select('url_prefix').eq('id', data.vertical_template_id)
      .maybeSingle<{ url_prefix: string }>();
    prefix = tpl?.url_prefix ?? null;
  }
  return { id: data.id, name: data.name, slug: data.slug, prefix };
}

async function isMember(businessId: string, email: string): Promise<boolean> {
  const { data } = await adminClient().from('admin_users').select('id')
    .eq('business_id', businessId).eq('email', email).maybeSingle<{ id: string }>();
  return data !== null;
}

export type CreateInviteParams = {
  readonly businessId: string;
  readonly email: string;
  readonly role: InviteRole;
  readonly createdBy: string | null;
};

export type CreateInviteResult =
  | { readonly ok: true; readonly inviteId: string; readonly emailSent: boolean }
  | { readonly ok: false; readonly reason: 'invalid_email' | 'invalid_role' | 'already_member' | 'no_business' | 'error' };

// Создаёт приглашение и отправляет письмо. Прежние неиспользованные приглашения на этот email в этот
// бизнес гасятся: действует только последняя ссылка. Права вызывающего проверяет action.
export async function createInvite(params: CreateInviteParams, now: Date = new Date()): Promise<CreateInviteResult> {
  const email = normalizeEmail(params.email);
  if (!email) return { ok: false, reason: 'invalid_email' };
  if (!isInviteRole(params.role)) return { ok: false, reason: 'invalid_role' };
  const business = await businessInfo(params.businessId);
  if (!business) return { ok: false, reason: 'no_business' };
  if (await isMember(business.id, email)) return { ok: false, reason: 'already_member' };

  const db = adminClient();
  await db.from(TABLE).update({ used_at: now.toISOString() })
    .eq('business_id', business.id).eq('email', email).is('used_at', null);
  const token = generateToken();
  const { data, error } = await db.from(TABLE).insert({
    business_id: business.id,
    email,
    role: params.role,
    token: tokenDigest(token),
    expires_at: expiresAt(now, INVITE_TTL_SECONDS).toISOString(),
    created_by: params.createdBy,
  }).select('id').maybeSingle<{ id: string }>();
  if (error || !data) return { ok: false, reason: 'error' };

  const emailSent = await deliver(inviteMail(email, token, business.name, params.role), 'invite');
  await authEvent('invite_created', { realm: 'owner', email, businessId: business.id, reason: params.role });
  return { ok: true, inviteId: data.id, emailSent };
}

async function findInvite(token: string): Promise<InviteRecord | null> {
  if (!isUuidV4(token)) return null;
  const { data } = await adminClient().from(TABLE).select('*').eq('token', tokenDigest(token)).maybeSingle<InviteRecord>();
  return data ?? null;
}

export type InviteView = {
  readonly state: TokenState;
  readonly email: string | null;
  readonly role: InviteRole | null;
  readonly businessName: string | null;
};

// Данные для страницы /invite/{token}. Приглашение не гасится.
export async function peekInvite(token: string, now: Date = new Date()): Promise<InviteView> {
  const invite = await findInvite(token);
  const state = tokenState(invite ? { expiresAt: invite.expires_at, usedAt: invite.used_at } : null, now);
  if (!invite || state !== 'valid') return { state, email: null, role: null, businessName: null };
  const business = await businessInfo(invite.business_id);
  return { state, email: invite.email, role: invite.role, businessName: business?.name ?? null };
}

export type AcceptInviteResult =
  | { readonly kind: 'ok'; readonly redirectTo: string }
  | { readonly kind: 'invalid' | 'expired' | 'used' | 'rate_limited' | 'too_short' | 'too_long' | 'wrong_password' | 'error' };

// Атомарный захват приглашения: только один параллельный запрос получит строку.
async function claimInvite(id: string, now: Date): Promise<boolean> {
  const nowIso = now.toISOString();
  const { data } = await adminClient().from(TABLE).update({ used_at: nowIso })
    .eq('id', id).is('used_at', null).gt('expires_at', nowIso).select('id').maybeSingle<{ id: string }>();
  return data !== null;
}

async function releaseInvite(id: string): Promise<void> {
  await adminClient().from(TABLE).update({ used_at: null }).eq('id', id);
}

// Учётная запись: новая — с заданным паролем; существующая (например, владелец другого бизнеса) —
// подтверждается её текущим паролем, чужой аккаунт приглашением не перехватить.
async function sessionForInvite(email: string, password: string): Promise<ProviderSession | 'wrong_password' | 'error'> {
  const created = await createUserWithPassword(email, password);
  if (created.kind === 'error') return 'error';
  const session = await passwordSignIn(email, password);
  if (session) return session;
  return created.kind === 'exists' ? 'wrong_password' : 'error';
}

function rejectedKind(state: TokenState): 'invalid' | 'expired' | 'used' {
  if (state === 'expired' || state === 'used') return state;
  return 'invalid';
}

export type AcceptInviteParams = { readonly token: string; readonly password: string; readonly ip: string };

export async function acceptInvite(params: AcceptInviteParams, now: Date = new Date()): Promise<AcceptInviteResult> {
  if (!(await allowRate('invite_accept', params.ip))) {
    await authEvent('login_rate_limited', { realm: 'owner', ip: params.ip, reason: 'invite_accept' });
    return { kind: 'rate_limited' };
  }
  const invite = await findInvite(params.token);
  const state = tokenState(invite ? { expiresAt: invite.expires_at, usedAt: invite.used_at } : null, now);
  if (!invite || state !== 'valid') {
    await authEvent('invite_rejected', { realm: 'owner', ip: params.ip, reason: state });
    return { kind: rejectedKind(state) };
  }
  const passwordCheck = checkPassword(params.password);
  if (passwordCheck !== 'ok') return { kind: passwordCheck };
  if (!(await claimInvite(invite.id, now))) return { kind: 'used' };

  const result = await finishAccept(invite, params);
  if (result.kind !== 'ok') await releaseInvite(invite.id);
  return result;
}

async function finishAccept(invite: InviteRecord, params: AcceptInviteParams): Promise<AcceptInviteResult> {
  const business = await businessInfo(invite.business_id);
  if (!business?.prefix) return { kind: 'error' };
  const session = await sessionForInvite(invite.email, params.password);
  if (session === 'wrong_password') {
    await authEvent('invite_rejected', { realm: 'owner', email: invite.email, ip: params.ip, reason: 'existing_account_wrong_password' });
    return { kind: 'wrong_password' };
  }
  if (session === 'error') return { kind: 'error' };

  if (!(await isMember(business.id, invite.email))) {
    const { error } = await adminClient().from('admin_users').insert({
      business_id: business.id, email: invite.email, role: invite.role, auth_user_id: session.user.id,
    });
    if (error) return { kind: 'error' };
  }
  startSession('owner', session);
  await authEvent('invite_accepted', { realm: 'owner', email: invite.email, ip: params.ip, businessId: business.id });
  return { kind: 'ok', redirectTo: `/${business.prefix}/${business.slug}/panel` };
}

// Ожидающие приглашения бизнеса — для страницы «Команда» (агент 6).
export async function listPendingInvites(businessId: string, now: Date = new Date()): Promise<InviteRecord[]> {
  const { data } = await adminClient().from(TABLE).select('*')
    .eq('business_id', businessId).is('used_at', null).gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .returns<InviteRecord[]>();
  return data ?? [];
}

// Отзыв приглашения владельцем: гасим, привязка к business_id не даёт отозвать чужое.
export async function revokeInvite(inviteId: string, businessId: string, now: Date = new Date()): Promise<boolean> {
  if (!UUID_RE.test(inviteId)) return false;
  const { data } = await adminClient().from(TABLE).update({ used_at: now.toISOString() })
    .eq('id', inviteId).eq('business_id', businessId).is('used_at', null).select('id').maybeSingle<{ id: string }>();
  return data !== null;
}
