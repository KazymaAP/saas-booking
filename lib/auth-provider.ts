// lib/auth-provider.ts — единственная точка обращения к Supabase Auth (ТЗ §5.1, §22 этап 1 п.2).
// При переходе на Better Auth меняется только этот файл: остальные lib/auth-* работают через его интерфейс.
// Пароли и токены никогда не логируются и не возвращаются наружу, кроме пары токенов сессии.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from './supabase';
import { jwtAlg, verifyJwtHs256, type JwtClaims } from './auth-core';
import type { SessionTokens } from './auth-cookies';

export type ProviderUser = { readonly id: string; readonly email: string };
export type ProviderSession = { readonly user: ProviderUser; readonly tokens: SessionTokens };

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

// Клиент с anon-ключом без сохранения сессии: каждый вызов независим, состояние живёт только в cookie.
function anonClient(): SupabaseClient {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type RawSession = { access_token: string; refresh_token: string; user: { id: string; email?: string } } | null;

function toSession(raw: RawSession): ProviderSession | null {
  const email = raw?.user.email?.toLowerCase();
  if (!raw || !email) return null;
  return {
    user: { id: raw.user.id, email },
    tokens: { accessToken: raw.access_token, refreshToken: raw.refresh_token },
  };
}

export async function passwordSignIn(email: string, password: string): Promise<ProviderSession | null> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error) return null;
  return toSession(data.session);
}

// Ротация refresh-токена: старый refresh становится недействительным (защита от повторного использования).
export async function refreshTokens(refreshToken: string): Promise<ProviderSession | null> {
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error) return null;
  return toSession(data.session);
}

// Проверка access-токена. Если задан SUPABASE_JWT_SECRET и токен подписан HS256 — локально
// (без сети, ≤ 100 мс), иначе — запросом в Auth. Возвращает null для просроченного или поддельного токена.
// Токены с асимметричной подписью (ES256/RS256 — новые ключи Supabase) проверяет Auth: если отвергать их
// локально, каждая страница уходила бы на /api/auth/refresh, получала новый такой же токен — цикл.
export async function verifyAccessToken(token: string, now: Date = new Date()): Promise<JwtClaims | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret && jwtAlg(token) === 'HS256') return verifyJwtHs256(token, secret, now);
  const { data, error } = await anonClient().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !data.user || !email) return null;
  return { sub: data.user.id, email, exp: Math.floor(now.getTime() / 1000) + 1 };
}

// Сессия без пароля (magic-link): одноразовая ссылка Supabase генерируется сервером и сразу
// обменивается на сессию. Письмо Supabase не отправляется — письмо шлёт наш lib/auth-mail.ts.
export async function sessionWithoutPassword(email: string): Promise<ProviderSession | null> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = data.properties?.hashed_token;
  if (error || !tokenHash) return null;
  const verified = await anonClient().auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (verified.error) return null;
  return toSession(verified.data.session);
}

export async function setUserPassword(userId: string, password: string): Promise<boolean> {
  const { error } = await adminClient().auth.admin.updateUserById(userId, { password });
  return !error;
}

export type CreateUserResult = { readonly kind: 'created'; readonly user: ProviderUser } | { readonly kind: 'exists' } | { readonly kind: 'error' };

// Email подтверждён по факту: пользователь пришёл по ссылке из письма на этот адрес.
export async function createUserWithPassword(email: string, password: string): Promise<CreateUserResult> {
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (data.user && !error) return { kind: 'created', user: { id: data.user.id, email } };
  const status = error?.status ?? 0;
  const HTTP_CONFLICT = 422;
  return status === HTTP_CONFLICT || /already/i.test(error?.message ?? '') ? { kind: 'exists' } : { kind: 'error' };
}

export type RevokeScope = 'local' | 'global';

// Отзыв сессии на стороне провайдера. 'local' — только эта сессия (выход), 'global' — все (сброс пароля).
export async function revokeSession(accessToken: string, scope: RevokeScope): Promise<void> {
  const { error } = await adminClient().auth.admin.signOut(accessToken, scope);
  if (error) throw new Error(`revoke failed: ${error.status ?? 'unknown'}`);
}

// Выход из всех сессий пользователя (после сброса пароля): старые refresh-токены перестают работать.
export async function revokeAllSessions(accessToken: string): Promise<void> {
  await revokeSession(accessToken, 'global');
}
