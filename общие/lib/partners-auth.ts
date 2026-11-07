// lib/partners-auth.ts — авторизация партнёров (друзей/знакомых) в партнёрской программе.
// Независима от Supabase Auth: пароль хешируется scrypt, сессия — HMAC-подписанный токен
// в httpOnly-cookie (паттерн совместим с lib/auth-cookies.ts, но для отдельной аудитории).
// ⚠️ Только серверный код (server actions / route handlers / server components).
import { cookies } from 'next/headers';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto';

const SESSION_COOKIE = 'partner_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

// ---------- хеширование пароля (scrypt) ----------
function toBase64(buf: Buffer): string {
  return buf.toString('base64');
}

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 64);
  return `scrypt$${toBase64(salt)}$${toBase64(derived)}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'base64');
  const expected = Buffer.from(parts[2], 'base64');
  const derived = scryptSync(plain, salt, 64);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// ---------- подпись сессии (HMAC-SHA256) ----------
function sessionSecret(): string {
  const fromEnv = (process.env.PARTNER_SESSION_SECRET ?? '').trim();
  if (fromEnv) return fromEnv;
  const enc = (process.env.ENCRYPTION_KEY ?? '').trim();
  if (enc) return enc; // ENCRYPTION_KEY — 64 hex-символа, годится как ключ HMAC
  // Только для локального дев-режима без ключей. В проде обязательно задать PARTNER_SESSION_SECRET.
  if (process.env.NODE_ENV !== 'production') return 'dev-partner-session-secret-change-me';
  throw new Error('PARTNER_SESSION_SECRET не задан');
}

function sign(data: string): string {
  return createHmac('sha256', sessionSecret()).update(data).digest('base64url');
}

export type PartnerSession = { partnerId: string; exp: number };

export function createPartnerSession(partnerId: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${partnerId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyPartnerSession(token: string | undefined | null): PartnerSession | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [partnerId, expStr, sig] = parts;
  const payload = `${partnerId}.${expStr}`;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return { partnerId, exp };
}

// ---------- cookie-обёртка ----------
export function writePartnerSessionCookie(token: string): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearPartnerSessionCookie(): void {
  cookies().set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function readPartnerSession(): PartnerSession | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifyPartnerSession(token);
}

// ---------- реферальный код ----------
export function generateReferralCode(): string {
  // Читаемый код: префикс + base36 от случайных байт (без неоднозначных символов).
  const raw = randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return `PR-${raw}`;
}
