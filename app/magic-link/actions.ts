'use server';
// app/magic-link/actions.ts — magic-link (ТЗ §5.3, §5.4): запрос письма и вход по ссылке.
// Оба действия — POST с проверкой Origin. В URL после запроса — только код уведомления, без email.
import { redirect } from 'next/navigation';
import { consumeMagicLink, requestMagicLink, type MagicConsumeResult } from '@/lib/auth-magic';
import { requestContext } from '@/lib/auth-request';
import { authEvent } from '@/lib/auth-audit';
import { isUuidV4 } from '@/lib/auth-core';
import { formString, realmFromNext, withQuery, type AuthErrorCode } from '@/lib/auth-forms';

const PAGE = '/magic-link';

// Отклоняет запрос с чужого Origin: redirect на форму с кодом ошибки.
async function assertOrigin(next: string | null): Promise<string> {
  const ctx = requestContext();
  if (!ctx.sameOrigin) {
    await authEvent('csrf_rejected', { ip: ctx.ip, reason: 'magic_link' });
    redirect(withQuery(PAGE, { error: 'forbidden_origin', next }));
  }
  return ctx.ip;
}

export async function requestMagicLinkAction(form: FormData): Promise<void> {
  const { realm, next } = realmFromNext(formString(form, 'next'));
  const ip = await assertOrigin(next);
  const result = await requestMagicLink({ email: formString(form, 'email'), realm, returnTo: next, ip });
  if (result === 'sent') redirect(withQuery(PAGE, { notice: 'magic_sent', next }));
  redirect(withQuery(PAGE, { error: result, next }));
}

const ERROR_BY_KIND: Record<Exclude<MagicConsumeResult['kind'], 'ok'>, AuthErrorCode> = {
  invalid: 'link_invalid',
  rate_limited: 'rate_limited',
  inactive: 'inactive',
  error: 'error',
};

export async function consumeMagicLinkAction(form: FormData): Promise<void> {
  const token = formString(form, 'token');
  const ip = await assertOrigin(null);
  const result = await consumeMagicLink(token, ip);
  if (result.kind === 'ok') redirect(result.redirectTo);
  // После сбоя провайдера ссылка снова рабочая — оставляем пользователя на ней; иначе — на форму запроса.
  const keepToken = result.kind === 'error' && isUuidV4(token) ? token : null;
  redirect(withQuery(PAGE, { error: ERROR_BY_KIND[result.kind], token: keepToken }));
}
