// lib/auth-audit.ts — журнал событий аутентификации в audit_log (ТЗ §17, §33).
// Логи без PII: email и IP пишутся только как короткие отпечатки (fingerprint), пароли и токены — никогда.
import { audit } from './audit';
import { fingerprint, type AuthRealm } from './auth-core';

export type { AuthRealm };

export type AuthAction =
  | 'login_success'
  | 'login_failed'
  | 'login_rate_limited'
  | 'logout'
  | 'session_refreshed'
  | 'magic_link_requested'
  | 'magic_link_used'
  | 'magic_link_rejected'
  | 'reset_requested'
  | 'reset_completed'
  | 'reset_rejected'
  | 'invite_created'
  | 'invite_accepted'
  | 'invite_rejected'
  | 'csrf_rejected'
  | 'rate_limit_unavailable';

export type AuthEventDetails = {
  readonly realm?: AuthRealm;
  readonly email?: string | null;
  readonly ip?: string | null;
  readonly reason?: string;
  readonly businessId?: string | null;
};

export async function authEvent(action: AuthAction, details: AuthEventDetails = {}): Promise<void> {
  const payload: Record<string, string> = {};
  if (details.realm) payload.realm = details.realm;
  if (details.email) payload.email_fp = fingerprint(details.email);
  if (details.ip) payload.ip_fp = fingerprint(details.ip);
  if (details.reason) payload.reason = details.reason;
  try {
    await audit(`auth:${action}`, 'auth', details.businessId ?? null, payload);
  } catch (err) {
    // Журнал не должен ломать вход: сбой записи аудита фиксируем в логах платформы без PII.
    console.error('[auth-audit] запись не удалась', action, err instanceof Error ? err.message : 'unknown');
  }
}
