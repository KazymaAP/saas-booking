// lib/auth-magic.ts — вход по одноразовой ссылке (ТЗ §5.3, §5.4): альтернатива паролю, не основной метод.
// Токен uuid v4, TTL 15 минут, одноразовый, rate limit 3/15 мин/email (+10/15 мин/IP против перебора адресов).
// Ответ на запрос всегда одинаковый («если адрес зарегистрирован — письмо отправлено»): нельзя выяснить,
// кто зарегистрирован. Ссылка гасится только POST-ом со страницы /magic-link (почтовые сканеры делают GET).
import { MAGIC_LINK_TTL_SECONDS, normalizeEmail } from './auth-core';
import { allowAll, allowRate } from './auth-rate';
import { authEvent } from './auth-audit';
import { deliver, magicLinkMail } from './auth-mail';
import { claimToken, issueToken, peekToken, releaseToken } from './auth-tokens';
import { sessionWithoutPassword } from './auth-provider';
import { ADMIN_HOME, isEligible, normalizeReturnTo, startRealmSession } from './auth-flow';
import type { AuthRealm } from './auth-core';

export { slugFromPanelPath } from './auth-flow';

export type MagicRequest = {
  readonly email: string;
  readonly realm: AuthRealm;
  // Куда вернуть после входа. Для владельца обязателен: из него берётся slug бизнеса.
  readonly returnTo: string | null;
  readonly ip: string;
};

export type MagicRequestResult = 'sent' | 'rate_limited' | 'invalid_email';

export async function requestMagicLink(req: MagicRequest): Promise<MagicRequestResult> {
  const email = normalizeEmail(req.email);
  if (!email) return 'invalid_email';
  if (!(await allowAll([['magic_link', email], ['login_ip', req.ip]]))) {
    await authEvent('login_rate_limited', { realm: req.realm, email, ip: req.ip, reason: 'magic_link' });
    return 'rate_limited';
  }
  const returnTo = normalizeReturnTo(req.realm, req.returnTo);
  if (!(await isEligible(email, req.realm, returnTo))) {
    await authEvent('magic_link_rejected', { realm: req.realm, email, ip: req.ip, reason: 'not_eligible' });
    return 'sent';
  }
  const token = await issueToken({ kind: 'magic_link', email, realm: req.realm, returnTo, ttlSeconds: MAGIC_LINK_TTL_SECONDS });
  if (token) await deliver(magicLinkMail(email, token), 'magic_link');
  await authEvent('magic_link_requested', { realm: req.realm, email, ip: req.ip, reason: token ? 'issued' : 'store_failed' });
  return 'sent';
}

export type MagicPeek = 'valid' | 'expired' | 'used' | 'invalid';

// Для страницы /magic-link: показать кнопку «Войти» или сообщение. Ссылка не гасится.
export async function peekMagicLink(token: string): Promise<MagicPeek> {
  const { state } = await peekToken('magic_link', token);
  return state === 'not_found' ? 'invalid' : state;
}

export type MagicConsumeResult =
  | { readonly kind: 'ok'; readonly redirectTo: string }
  | { readonly kind: 'invalid' | 'rate_limited' | 'inactive' | 'error' };

// Погашение ссылки и вход. Вызывается из server action (POST) страницы /magic-link.
export async function consumeMagicLink(token: string, ip: string): Promise<MagicConsumeResult> {
  if (!(await allowRate('token_verify', ip))) return { kind: 'rate_limited' };
  const record = await claimToken('magic_link', token);
  if (!record) {
    await authEvent('magic_link_rejected', { ip, reason: 'invalid_or_used' });
    return { kind: 'invalid' };
  }
  const session = await sessionWithoutPassword(record.email);
  if (!session) {
    // Сбой провайдера — не вина пользователя: возвращаем ссылку в оборот до истечения TTL.
    await releaseToken(record.id);
    return { kind: 'error' };
  }
  const result = await startRealmSession(record.realm, session, record.return_to, ip, 'magic_link');
  if (result === 'inactive') return { kind: 'inactive' };
  if (result !== 'ok') return { kind: 'invalid' };
  await authEvent('magic_link_used', { realm: record.realm, email: record.email, ip });
  return { kind: 'ok', redirectTo: record.return_to ?? ADMIN_HOME };
}
