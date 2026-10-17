'use server';
// app/invite/[token]/actions.ts — принятие приглашения (ТЗ §5.6): установка пароля и вход в кабинет.
// Origin проверяется до любых действий (§5.9); пароль не попадает ни в URL, ни в журнал.
import { redirect } from 'next/navigation';
import { acceptInvite, type AcceptInviteResult } from '@/lib/auth-invites';
import { requestContext } from '@/lib/auth-request';
import { authEvent } from '@/lib/auth-audit';
import { formString, withQuery, type AuthErrorCode } from '@/lib/auth-forms';
import { isUuidV4 } from '@/lib/auth-core';

// Итоги принятия → код ошибки страницы. 'expired' и 'used' показываются отдельным экраном (peekInvite).
const ERROR_BY_KIND: Record<Exclude<AcceptInviteResult['kind'], 'ok'>, AuthErrorCode> = {
  invalid: 'link_invalid',
  expired: 'link_expired',
  used: 'link_invalid',
  rate_limited: 'rate_limited',
  too_short: 'too_short',
  too_long: 'too_long',
  wrong_password: 'wrong_password',
  error: 'error',
};

export async function acceptInviteAction(form: FormData): Promise<void> {
  const token = formString(form, 'token');
  // Токен из формы идёт в путь redirect: только валидный uuid, иначе — на корень.
  const page = isUuidV4(token) ? `/invite/${token}` : '/';
  const ctx = requestContext();
  if (!ctx.sameOrigin) {
    await authEvent('csrf_rejected', { realm: 'owner', ip: ctx.ip, reason: 'invite' });
    redirect(withQuery(page, { error: 'forbidden_origin' }));
  }
  const password = formString(form, 'password');
  if (password !== formString(form, 'confirm')) redirect(withQuery(page, { error: 'mismatch' }));

  const result = await acceptInvite({ token, password, ip: ctx.ip });
  if (result.kind === 'ok') redirect(result.redirectTo);
  redirect(withQuery(page, { error: ERROR_BY_KIND[result.kind] }));
}
