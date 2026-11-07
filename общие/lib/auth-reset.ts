// lib/auth-reset.ts — сброс пароля (ТЗ §5.5): /panel/forgot-password → письмо → /reset-password?token=...
// Токен uuid v4, TTL 1 час, одноразовый, rate limit 3/15 мин/email (+10/15 мин/IP против перебора адресов).
// Ответ на запрос одинаковый для любых адресов. После смены пароля все прежние сессии пользователя
// отзываются (украденная cookie перестаёт работать), затем открывается новая сессия.
import { checkPassword, normalizeEmail, RESET_TTL_SECONDS, type AuthRealm, type PasswordCheck } from './auth-core';
import { allowAll, allowRate } from './auth-rate';
import { authEvent } from './auth-audit';
import { deliver, resetMail } from './auth-mail';
import { claimToken, issueToken, peekToken, releaseToken, type TokenRecord } from './auth-tokens';
import { passwordSignIn, revokeAllSessions, sessionWithoutPassword, setUserPassword } from './auth-provider';
import { ADMIN_HOME, isEligible, loginPathFor, normalizeReturnTo, startRealmSession } from './auth-flow';

export type ResetRequest = {
  readonly email: string;
  readonly realm: AuthRealm;
  // Для владельца — путь его кабинета (из него берётся slug), для супер-админа можно null.
  readonly returnTo: string | null;
  readonly ip: string;
};

export type ResetRequestResult = 'sent' | 'rate_limited' | 'invalid_email';

export async function requestPasswordReset(req: ResetRequest): Promise<ResetRequestResult> {
  const email = normalizeEmail(req.email);
  if (!email) return 'invalid_email';
  if (!(await allowAll([['password_reset', email], ['login_ip', req.ip]]))) {
    await authEvent('login_rate_limited', { realm: req.realm, email, ip: req.ip, reason: 'password_reset' });
    return 'rate_limited';
  }
  const returnTo = normalizeReturnTo(req.realm, req.returnTo);
  if (!(await isEligible(email, req.realm, returnTo))) {
    await authEvent('reset_rejected', { realm: req.realm, email, ip: req.ip, reason: 'not_eligible' });
    return 'sent';
  }
  const token = await issueToken({ kind: 'reset', email, realm: req.realm, returnTo, ttlSeconds: RESET_TTL_SECONDS });
  if (token) await deliver(resetMail(email, token), 'reset');
  await authEvent('reset_requested', { realm: req.realm, email, ip: req.ip, reason: token ? 'issued' : 'store_failed' });
  return 'sent';
}

export type ResetPeek = 'valid' | 'expired' | 'used' | 'invalid';

// Для страницы /reset-password: показать форму нового пароля или сообщение. Ссылка не гасится.
export async function peekPasswordReset(token: string): Promise<ResetPeek> {
  const { state } = await peekToken('reset', token);
  return state === 'not_found' ? 'invalid' : state;
}

export type ResetCompleteResult =
  | { readonly kind: 'ok'; readonly redirectTo: string }
  // Пароль сменён, но войти автоматически не удалось (например, бизнес уже неактивен) — на страницу входа.
  | { readonly kind: 'changed'; readonly loginPath: string }
  | { readonly kind: Exclude<PasswordCheck, 'ok'> | 'mismatch' | 'invalid' | 'rate_limited' | 'error' };

export type ResetCompleteParams = {
  readonly token: string;
  readonly password: string;
  readonly confirm: string;
  readonly ip: string;
};

// Проверка ввода до погашения ссылки: ошибка в пароле не должна «сжигать» ссылку из письма.
function validateInput(params: ResetCompleteParams): ResetCompleteResult | null {
  const check = checkPassword(params.password);
  if (check !== 'ok') return { kind: check };
  if (params.password !== params.confirm) return { kind: 'mismatch' };
  return null;
}

// Смена пароля у провайдера. false — сбой провайдера (ссылку можно вернуть в оборот).
async function changePassword(record: TokenRecord, password: string): Promise<boolean> {
  const current = await sessionWithoutPassword(record.email);
  if (!current) return false;
  if (!(await setUserPassword(current.user.id, password))) return false;
  try {
    // Выход из всех сессий: старые refresh-токены (в том числе украденные) больше не работают.
    await revokeAllSessions(current.tokens.accessToken);
  } catch (err) {
    // Пароль уже сменён — откатывать нельзя. Фиксируем, сессии истекут по TTL access-токена.
    await authEvent('reset_completed', { realm: record.realm, reason: `revoke_failed:${err instanceof Error ? err.message.slice(0, 80) : 'unknown'}` });
  }
  return true;
}

export async function completePasswordReset(params: ResetCompleteParams): Promise<ResetCompleteResult> {
  if (!(await allowRate('token_verify', params.ip))) return { kind: 'rate_limited' };
  const invalidInput = validateInput(params);
  if (invalidInput) return invalidInput;
  const record = await claimToken('reset', params.token);
  if (!record) {
    await authEvent('reset_rejected', { ip: params.ip, reason: 'invalid_or_used' });
    return { kind: 'invalid' };
  }
  if (!(await changePassword(record, params.password))) {
    await releaseToken(record.id);
    return { kind: 'error' };
  }
  await authEvent('reset_completed', { realm: record.realm, email: record.email, ip: params.ip });

  const loginPath = loginPathFor(record.realm, record.return_to);
  const session = await passwordSignIn(record.email, params.password);
  if (!session) return { kind: 'changed', loginPath };
  const result = await startRealmSession(record.realm, session, record.return_to, params.ip, 'password_reset');
  if (result !== 'ok') return { kind: 'changed', loginPath };
  return { kind: 'ok', redirectTo: record.return_to ?? ADMIN_HOME };
}
