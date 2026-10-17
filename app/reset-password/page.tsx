// app/reset-password/page.tsx — новый пароль по ссылке из письма (ТЗ §5.5: /reset-password?token=...).
// GET ссылку не гасит (почтовые сканеры), смена пароля — только POST-ом формы (actions.ts).
// Без токена страница отправляет на форму запроса /panel/forgot-password. В Referer уходит только origin: политика strict-origin (lib/auth-forms.ts).
import { redirect } from 'next/navigation';
import { peekPasswordReset } from '@/lib/auth-reset';
import { AUTH_REFERRER_POLICY, errorText, LINK_STATE_ERROR, param, type SearchParams } from '@/lib/auth-forms';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-core';
import { AuthField, AuthForm, AuthLinks, AuthMessages, AuthShell, HiddenField, PASSWORD_HINT } from '@/components/auth/AuthUi';
import { completeResetAction } from './actions';

export const metadata = { title: 'Новый пароль', robots: { index: false, follow: false }, referrer: AUTH_REFERRER_POLICY };
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const token = param(searchParams, 'token');
  if (!token) redirect('/panel/forgot-password');
  const state = await peekPasswordReset(token);
  if (state !== 'valid') {
    return (
      <AuthShell title="Ссылка недействительна">
        <AuthMessages error={errorText(LINK_STATE_ERROR[state])} />
        <AuthLinks links={[{ href: '/panel/forgot-password', label: 'Запросить новую ссылку' }]} />
      </AuthShell>
    );
  }
  const errorCode = param(searchParams, 'error');
  const error = errorText(errorCode);
  return (
    <AuthShell title="Новый пароль">
      <p className="mt-3">Придумайте новый пароль. После сохранения все прежние входы будут завершены.</p>
      <AuthMessages error={error} />
      <AuthForm action={completeResetAction} submit="Сохранить пароль" pending="Сохраняем…">
        <HiddenField name="token" value={token} />
        <AuthField name="password" label="Новый пароль" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH}
          hint={PASSWORD_HINT} invalid={errorCode === 'too_short' || errorCode === 'too_long'} focus />
        <AuthField name="confirm" label="Новый пароль ещё раз" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH}
          invalid={errorCode === 'mismatch'} />
      </AuthForm>
    </AuthShell>
  );
}
