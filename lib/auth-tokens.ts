// lib/auth-tokens.ts — одноразовые токены magic-link и сброса пароля (ТЗ §5.4, §5.5).
// Таблица auth_tokens (миграция — запрос агенту 1, SQL в notes.md). В БД хранится только дайджест токена.
// Одноразовость: «захват» — один UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING,
// поэтому две параллельные попытки не могут использовать одну ссылку дважды.
import { adminClient } from './supabase';
import { expiresAt, generateToken, isUuidV4, tokenDigest, tokenState, type AuthRealm, type TokenState } from './auth-core';

export type TokenKind = 'magic_link' | 'reset';

export type TokenRecord = {
  readonly id: string;
  readonly kind: TokenKind;
  readonly email: string;
  readonly realm: AuthRealm;
  readonly return_to: string | null;
  readonly expires_at: string;
  readonly used_at: string | null;
};

const TABLE = 'auth_tokens';

export type IssueParams = {
  readonly kind: TokenKind;
  readonly email: string;
  readonly realm: AuthRealm;
  readonly returnTo: string | null;
  readonly ttlSeconds: number;
};

// Выпускает новый токен и гасит прежние неиспользованные того же вида для этого email:
// действует только последняя ссылка из почты.
export async function issueToken(params: IssueParams, now: Date = new Date()): Promise<string | null> {
  const db = adminClient();
  const token = generateToken();
  await db.from(TABLE).update({ used_at: now.toISOString() })
    .eq('kind', params.kind).eq('email', params.email).is('used_at', null);
  const { error } = await db.from(TABLE).insert({
    kind: params.kind,
    token_digest: tokenDigest(token),
    email: params.email,
    realm: params.realm,
    return_to: params.returnTo,
    expires_at: expiresAt(now, params.ttlSeconds).toISOString(),
  });
  return error ? null : token;
}

// Просмотр без погашения (для отрисовки формы). Неверный формат токена не идёт в БД.
export async function peekToken(kind: TokenKind, token: string, now: Date = new Date()): Promise<{ state: TokenState; record: TokenRecord | null }> {
  if (!isUuidV4(token)) return { state: 'not_found', record: null };
  const { data } = await adminClient().from(TABLE).select('*')
    .eq('kind', kind).eq('token_digest', tokenDigest(token)).maybeSingle<TokenRecord>();
  const state = tokenState(data ? { expiresAt: data.expires_at, usedAt: data.used_at } : null, now);
  return { state, record: data };
}

// Атомарное погашение. null — токен не найден, истёк или уже использован.
export async function claimToken(kind: TokenKind, token: string, now: Date = new Date()): Promise<TokenRecord | null> {
  if (!isUuidV4(token)) return null;
  const nowIso = now.toISOString();
  const { data } = await adminClient().from(TABLE).update({ used_at: nowIso })
    .eq('kind', kind).eq('token_digest', tokenDigest(token)).is('used_at', null).gt('expires_at', nowIso)
    .select('*').maybeSingle<TokenRecord>();
  return data ?? null;
}

// Возврат токена, если после погашения действие не удалось по нашей вине (например, сбой Auth):
// пользователь сможет повторить по той же ссылке, пока не истёк TTL.
export async function releaseToken(id: string): Promise<void> {
  await adminClient().from(TABLE).update({ used_at: null }).eq('id', id);
}
