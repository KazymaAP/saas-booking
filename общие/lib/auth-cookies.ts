// lib/auth-cookies.ts — cookie сессий супер-админа и владельца (ТЗ §5.1, §5.8).
// Правила: host-only (без domain), httpOnly, secure, sameSite=lax, path=/, 30 дней.
// В cookie хранится пара токенов провайдера: короткий access (≈1 час) и refresh (ротация при обновлении).
// Пароль в cookie не пишется никогда.
import { cookies } from 'next/headers';
import { SESSION_TTL_SECONDS } from './auth-core';

export type SessionKind = 'admin' | 'owner';

// Имена access-cookie сохранены (sa_session, biz_session): смена имени разлогинила бы всех пользователей.
const COOKIE_NAMES: Record<SessionKind, { access: string; refresh: string }> = {
  admin: { access: 'sa_session', refresh: 'sa_refresh' },
  owner: { access: 'biz_session', refresh: 'biz_refresh' },
};

export type SessionTokens = { readonly accessToken: string; readonly refreshToken: string };

type CookieOptions = {
  httpOnly: true;
  secure: true;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

// domain намеренно не задаётся: cookie привязана к точному хосту, сессии доменов не пересекаются (§5.8).
export function sessionCookieOptions(maxAge: number = SESSION_TTL_SECONDS): CookieOptions {
  return { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge };
}

export function cookieNames(kind: SessionKind): { access: string; refresh: string } {
  return COOKIE_NAMES[kind];
}

export function readSessionCookies(kind: SessionKind): { accessToken: string | null; refreshToken: string | null } {
  const jar = cookies();
  const names = COOKIE_NAMES[kind];
  return {
    accessToken: jar.get(names.access)?.value ?? null,
    refreshToken: jar.get(names.refresh)?.value ?? null,
  };
}

// Писать cookie можно только из Server Action или Route Handler (ограничение Next.js).
export function writeSessionCookies(kind: SessionKind, tokens: SessionTokens): void {
  const jar = cookies();
  const names = COOKIE_NAMES[kind];
  const options = sessionCookieOptions();
  jar.set(names.access, tokens.accessToken, options);
  jar.set(names.refresh, tokens.refreshToken, options);
}

export function clearSessionCookies(kind: SessionKind): void {
  const jar = cookies();
  const names = COOKIE_NAMES[kind];
  // Удаление тем же набором атрибутов, иначе браузер может оставить старую cookie.
  const expired = sessionCookieOptions(0);
  jar.set(names.access, '', expired);
  jar.set(names.refresh, '', expired);
}
