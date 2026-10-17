// lib/admin-session.ts — сессия супер-админа (ТЗ §5.2, §5.3, §16): email + пароль, доступ по SUPERADMIN_EMAILS.
// Безопасность: проверка Origin (§5.9), rate limit 10/15 мин/IP и 5/15 мин/email (§7.2), cookie host-only,
// httpOnly, secure, sameSite=lax (§5.8), журнал входов в audit_log без PII (§17.8).
import { cache } from './react-cache';
import { listIncludesSafe, normalizeEmail, parseEmailList, type SignInResult } from './auth-core';
import { requestContext } from './auth-request';
import { allowAll } from './auth-rate';
import { authEvent } from './auth-audit';
import { passwordSignIn } from './auth-provider';
import { endSession, readSession, refreshSession, startSession } from './auth-session';
import { cookieNames } from './auth-cookies';

// Имя cookie сохранено для совместимости: на него могут ссылаться внешние проверки.
export const SESSION_COOKIE = cookieNames('admin').access;

export function superAdminEmails(): string[] {
  return parseEmailList(process.env.SUPERADMIN_EMAILS);
}

export function isSuperAdminEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized !== null && listIncludesSafe(superAdminEmails(), normalized);
}

export async function signInSuperAdmin(rawEmail: string, password: string): Promise<SignInResult> {
  const ctx = requestContext();
  if (!ctx.sameOrigin) {
    await authEvent('csrf_rejected', { realm: 'admin', ip: ctx.ip });
    return 'forbidden_origin';
  }
  const email = normalizeEmail(rawEmail);
  const allowed = await allowAll([['login_ip', ctx.ip], ['login_email', email ?? rawEmail]]);
  if (!allowed) {
    await authEvent('login_rate_limited', { realm: 'admin', email, ip: ctx.ip });
    return 'rate_limited';
  }
  if (!email || password.length === 0) {
    await authEvent('login_failed', { realm: 'admin', ip: ctx.ip, reason: 'malformed' });
    return 'invalid';
  }
  // Пароль проверяется всегда, даже для адреса вне списка: время ответа не выдаёт, кто супер-админ.
  const session = await passwordSignIn(email, password);
  if (!session || !isSuperAdminEmail(session.user.email)) {
    await authEvent('login_failed', { realm: 'admin', email, ip: ctx.ip, reason: session ? 'not_superadmin' : 'bad_credentials' });
    return 'invalid';
  }
  startSession('admin', session);
  await authEvent('login_success', { realm: 'admin', email, ip: ctx.ip });
  return 'ok';
}

export type AdminAccess = 'ok' | 'refresh' | 'none';

async function superAdminAccessUncached(): Promise<AdminAccess> {
  const state = await readSession('admin');
  if (state.kind === 'refresh_needed') return 'refresh';
  if (state.kind === 'none' || !isSuperAdminEmail(state.claims.email)) return 'none';
  return state.refreshSoon ? 'refresh' : 'ok';
}

// Состояние доступа для layout: 'refresh' — access истёк или скоро истечёт, нужен /api/auth/refresh.
export const superAdminAccess = cache(superAdminAccessUncached);

async function isSuperAdminUncached(): Promise<boolean> {
  const state = await readSession('admin');
  return state.kind === 'active' && isSuperAdminEmail(state.claims.email);
}

// Кэш в рамках одного запроса. Для route handlers и server components (только чтение cookie).
export const isSuperAdmin = cache(isSuperAdminUncached);

// Для Server Actions: при истёкшем access-токене обновляет сессию (здесь писать cookie можно).
// Server Action — отдельный POST-эндпоинт, защиты layout для него недостаточно.
export async function requireSuperAdminAction(): Promise<boolean> {
  if (!requestContext().sameOrigin) return false;
  if (await isSuperAdmin()) return true;
  const refreshed = await refreshSession('admin');
  return refreshed !== null && isSuperAdminEmail(refreshed.user.email);
}

export async function signOutSuperAdmin(): Promise<void> {
  await endSession('admin');
  await authEvent('logout', { realm: 'admin', ip: requestContext().ip });
}

// Короткие имена из DoD зоны 12.
export const signIn = signInSuperAdmin;
export const signOut = signOutSuperAdmin;
