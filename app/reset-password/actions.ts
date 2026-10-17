'use server';
// app/reset-password/actions.ts — сброс пароля (ТЗ §5.5): запрос письма (форма /panel/forgot-password)
// и установка нового пароля по ссылке /reset-password?token=... Оба действия — POST с проверкой Origin.
import { redirect } from 'next/navigation';
import { completePasswordReset, requestPasswordReset, type ResetCompleteResult } from '@/lib/auth-reset';
import { requestContext } from '@/lib/auth-request';
import { authEvent } from '@/lib/auth-audit';
import { isUuidV4 } from '@/lib/auth-core';
import { formString, realmFromNext, withQuery, type AuthErrorCode } from '@/lib/auth-forms';

const FORGOT_PAGE = '/panel/forgot-password';
const RESET_PAGE = '/reset-password';

async function originIp(back: string): Promise<string> {
  const ctx = requestContext();
  if (!ctx.sameOrigin) {
    await authEvent('csrf_rejected', { ip: ctx.ip, reason: 'password_reset' });
    redirect(withQuery(back, { error: 'forbidden_origin' }));
  }
  return ctx.ip;
}

export async function requestResetAction(form: FormData): Promise<void> {
  const { realm, next } = realmFromNext(formString(form, 'next'));
  const ip = await originIp(withQuery(FORGOT_PAGE, { next }));
  const result = await requestPasswordReset({ email: formString(form, 'email'), realm, returnTo: next, ip });
  if (result === 'sent') redirect(withQuery(FORGOT_PAGE, { notice: 'reset_sent', next }));
  redirect(withQuery(FORGOT_PAGE, { error: result, next }));
}

type ResetFailure = Exclude<ResetCompleteResult['kind'], 'ok' | 'changed'>;

const ERROR_BY_KIND: Record<ResetFailure, AuthErrorCode> = {
  too_short: 'too_short',
  too_long: 'too_long',
  mismatch: 'mismatch',
  invalid: 'link_invalid',
  rate_limited: 'rate_limited',
  error: 'error',
};

export async function completeResetAction(form: FormData): Promise<void> {
  const token = formString(form, 'token');
  // Токен попадает обратно в URL формы только если это корректный uuid (не даём внедрить произвольную строку).
  const safeToken = isUuidV4(token) ? token : null;
  const ip = await originIp(withQuery(RESET_PAGE, { token: safeToken }));
  const result = await completePasswordReset({
    token, password: formString(form, 'password'), confirm: formString(form, 'confirm'), ip,
  });
  if (result.kind === 'ok') redirect(result.redirectTo);
  if (result.kind === 'changed') redirect(withQuery(result.loginPath, { notice: 'password_changed' }));
  // Ссылка уже недействительна — повторять на ней бессмысленно, ведём на запрос новой.
  if (result.kind === 'invalid') redirect(withQuery(FORGOT_PAGE, { error: 'link_invalid' }));
  redirect(withQuery(RESET_PAGE, { token: safeToken, error: ERROR_BY_KIND[result.kind] }));
}
