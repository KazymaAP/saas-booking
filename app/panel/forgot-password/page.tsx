// app/panel/forgot-password/page.tsx — запрос сброса пароля (ТЗ §5.5: /panel/forgot-password → письмо).
// Общая страница для супер-админа и владельцев: область определяется по ?next= (/panel... или
// /{prefix}/{slug}/panel...). Ответ одинаковый для любого адреса — нельзя выяснить, кто зарегистрирован.
// Страница вне (protected): layout супер-админки её не закрывает.
import { AUTH_REFERRER_POLICY, errorText, noticeText, param, realmFromNext, type SearchParams } from '@/lib/auth-forms';
import { loginPathFor } from '@/lib/auth-flow';
import { RESET_TTL_SECONDS, ttlText } from '@/lib/auth-core';
import { AuthField, AuthForm, AuthLinks, AuthMessages, AuthShell, HiddenField } from '@/components/auth/AuthUi';
import { requestResetAction } from '@/app/reset-password/actions';

export const metadata = { title: 'Восстановление пароля', robots: { index: false, follow: false }, referrer: AUTH_REFERRER_POLICY };
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { realm, next } = realmFromNext(param(searchParams, 'next'));
  const error = errorText(param(searchParams, 'error'));
  const notice = error ? null : noticeText(param(searchParams, 'notice'));
  return (
    <AuthShell title="Восстановление пароля">
      <p className="mt-3">Укажите почту, с которой входите. Мы пришлём ссылку для смены пароля — она действует {ttlText(RESET_TTL_SECONDS)}.</p>
      <AuthMessages error={error} notice={notice} />
      <AuthForm action={requestResetAction} submit="Отправить ссылку" pending="Отправляем…">
        <HiddenField name="next" value={next} />
        <AuthField name="email" label="Почта" type="email" autoComplete="email" invalid={Boolean(error)} focus={!notice} />
      </AuthForm>
      <AuthLinks links={[{ href: loginPathFor(realm, next), label: 'Вернуться ко входу' }]} />
    </AuthShell>
  );
}
