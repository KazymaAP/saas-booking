// app/unsubscribe/[token]/actions.ts — подтверждение отписки со страницы и необязательная причина (ТЗ 4.0 §9.5).
// Server actions вызываются формой без клиентского JS; результат — редирект с параметром состояния (PRG),
// поэтому обновление страницы не отправляет форму повторно.
'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hitRateLimit } from '@/lib/rate-limit';
import {
  getClientIp, isTrustedOrigin, isUnsubscribeReason, logLegalError, maskEmail, parseUnsubscribeToken, setUnsubscribeReason,
  unsubscribeEmail,
} from '@/lib/legal';

// Тот же лимит, что и у One-Click API: 10 действий в час с IP.
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 3_600;

export type UnsubscribePageStatus = 'done' | 'already' | 'reason_saved' | 'error' | 'rate_limited' | 'forbidden';

const back = (token: string, status: UnsubscribePageStatus) => `/unsubscribe/${encodeURIComponent(token)}?status=${status}`;

// Общая проверка: Origin своего сайта, лимит, валидный токен. Возвращает email или статус ошибки.
async function guard(token: string): Promise<{ email: string } | { status: UnsubscribePageStatus }> {
  const request_headers = headers();
  if (!isTrustedOrigin(request_headers.get('origin'), request_headers.get('host'))) return { status: 'forbidden' };
  let allowed = true;
  try {
    allowed = await hitRateLimit(`unsubscribe:${getClientIp(request_headers)}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
  } catch {
    // Лимитер недоступен — fail open (ТЗ §7.3): отписка важнее.
    allowed = true;
  }
  if (!allowed) return { status: 'rate_limited' };
  const email = parseUnsubscribeToken(token);
  return email ? { email } : { status: 'error' };
}

export async function confirmUnsubscribe(token: string): Promise<never> {
  const checked = await guard(token);
  if ('status' in checked) redirect(back(token, checked.status));
  let status: UnsubscribePageStatus = 'error';
  try {
    const result = await unsubscribeEmail(checked.email, 'page');
    if (result.ok) status = result.already ? 'already' : 'done';
    else await logLegalError('unsubscribe: ошибка записи', { email: maskEmail(checked.email), source: 'page' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'неизвестная ошибка';
    await logLegalError(`unsubscribe: ${message}`, { email: maskEmail(checked.email), source: 'page' });
  }
  // redirect бросает служебное исключение Next — вызывается вне try.
  redirect(back(token, status));
}

export async function saveUnsubscribeReason(token: string, form: FormData): Promise<never> {
  const checked = await guard(token);
  if ('status' in checked) redirect(back(token, checked.status));
  const reason = form.get('reason');
  // Причина необязательна: пустой или чужой выбор просто не сохраняется, отписка уже действует.
  if (typeof reason === 'string' && isUnsubscribeReason(reason)) {
    const saved = await setUnsubscribeReason(checked.email, reason).catch(() => false);
    if (!saved) await logLegalError('unsubscribe: причина не сохранена', { email: maskEmail(checked.email) });
  }
  redirect(back(token, 'reason_saved'));
}
