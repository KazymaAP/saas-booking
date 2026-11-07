// lib/auth-session.ts — общая логика сессий для супер-админа и владельца (ТЗ §5.1, §5.8).
// Чтение сессии кэшируется в рамках запроса (react cache): layout и страница не проверяют токен дважды.
// Обновление токенов возможно только там, где Next.js разрешает писать cookie: Server Action и Route Handler
// (/api/auth/refresh). Server Components при истёкшем access-токене перенаправляют на /api/auth/refresh.
import { cache } from './react-cache';
import { accessTokenFresh, type AuthRealm, type JwtClaims } from './auth-core';
import { clearSessionCookies, readSessionCookies, writeSessionCookies } from './auth-cookies';
import { refreshTokens, revokeSession, verifyAccessToken, type ProviderSession } from './auth-provider';
import { authEvent } from './auth-audit';

export type SessionState =
  | { readonly kind: 'active'; readonly claims: JwtClaims; readonly refreshSoon: boolean }
  | { readonly kind: 'refresh_needed' }
  | { readonly kind: 'none' };

async function readSessionUncached(realm: AuthRealm): Promise<SessionState> {
  const { accessToken, refreshToken } = readSessionCookies(realm);
  if (accessToken) {
    const claims = await verifyAccessToken(accessToken);
    if (claims) {
      // Токен ещё действует, но скоро истечёт: страница обновит его заранее (если есть refresh).
      const refreshSoon = Boolean(refreshToken) && !accessTokenFresh(accessToken, new Date());
      return { kind: 'active', claims, refreshSoon };
    }
  }
  return refreshToken ? { kind: 'refresh_needed' } : { kind: 'none' };
}

export const readSession = cache(readSessionUncached);

// Обновляет пару токенов и перезаписывает cookie. Только Server Action / Route Handler.
export async function refreshSession(realm: AuthRealm): Promise<ProviderSession | null> {
  const { refreshToken } = readSessionCookies(realm);
  if (!refreshToken) return null;
  const session = await refreshTokens(refreshToken);
  if (!session) {
    clearSessionCookies(realm);
    return null;
  }
  writeSessionCookies(realm, session.tokens);
  await authEvent('session_refreshed', { realm });
  return session;
}

export function startSession(realm: AuthRealm, session: ProviderSession): void {
  writeSessionCookies(realm, session.tokens);
}

// Действующий access-токен для отзыва: текущий, а если он истёк — полученный по refresh.
async function accessForRevoke(realm: AuthRealm): Promise<string | null> {
  const { accessToken, refreshToken } = readSessionCookies(realm);
  if (accessToken && (await verifyAccessToken(accessToken))) return accessToken;
  if (!refreshToken) return null;
  const refreshed = await refreshTokens(refreshToken);
  return refreshed?.tokens.accessToken ?? null;
}

// Выход: сессия отзывается у провайдера (refresh-токен из украденной cookie перестаёт работать),
// затем cookie стираются. Сбой отзыва не мешает выходу в этом браузере — он фиксируется в журнале.
export async function endSession(realm: AuthRealm): Promise<void> {
  try {
    const accessToken = await accessForRevoke(realm);
    if (accessToken) await revokeSession(accessToken, 'local');
  } catch (err) {
    await authEvent('logout', { realm, reason: `revoke_failed:${err instanceof Error ? err.message.slice(0, 80) : 'unknown'}` });
  }
  clearSessionCookies(realm);
}

// Адрес обновления сессии для Server Components: после обновления пользователь вернётся на next.
export function refreshUrl(realm: AuthRealm, next: string): string {
  const params = new URLSearchParams({ realm, next });
  return `/api/auth/refresh?${params.toString()}`;
}
