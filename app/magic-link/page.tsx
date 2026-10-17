// app/magic-link/page.tsx — вход по ссылке из письма (ТЗ §5.3, §5.4: /magic-link, /magic-link?token=...).
// Без token — форма запроса письма (область входа определяется по ?next=: /panel... или /{prefix}/{slug}/panel...).
// С token — кнопка «Войти»: GET ссылку не гасит (почтовые сканеры и превью открывают ссылки сами),
// вход происходит только POST-ом. Токен не утекает через Referer: политика strict-origin (lib/auth-forms.ts).
import { peekMagicLink } from '@/lib/auth-magic';
import { loginPathFor } from '@/lib/auth-flow';
import { MAGIC_LINK_TTL_SECONDS, ttlText } from '@/lib/auth-core';
import { AUTH_REFERRER_POLICY, errorText, LINK_STATE_ERROR, noticeText, param, realmFromNext, type SearchParams } from '@/lib/auth-forms';
import { AuthField, AuthForm, AuthLinks, AuthMessages, AuthShell, HiddenField } from '@/components/auth/AuthUi';
import { consumeMagicLinkAction, requestMagicLinkAction } from './actions';

export const metadata = { title: 'Вход по ссылке', robots: { index: false, follow: false }, referrer: AUTH_REFERRER_POLICY };
export const dynamic = 'force-dynamic';

async function ConsumeView({ token, error }: { readonly token: string; readonly error: string | null }) {
  const state = await peekMagicLink(token);
  if (state !== 'valid') {
    return (
      <AuthShell title="Ссылка недействительна">
        <AuthMessages error={errorText(LINK_STATE_ERROR[state])} />
        <AuthLinks links={[{ href: '/magic-link', label: 'Запросить новую ссылку' }]} />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Вход по ссылке">
      <AuthMessages error={error} />
      <p className="mt-3">Нажмите кнопку, чтобы войти. Ссылка сработает один раз.</p>
      <AuthForm action={consumeMagicLinkAction} submit="Войти" pending="Входим…">
        <HiddenField name="token" value={token} />
      </AuthForm>
    </AuthShell>
  );
}

export default async function MagicLinkPage({ searchParams }: { searchParams: SearchParams }) {
  const token = param(searchParams, 'token');
  const error = errorText(param(searchParams, 'error'));
  if (token) return <ConsumeView token={token} error={error} />;

  const { realm, next } = realmFromNext(param(searchParams, 'next'));
  const notice = error ? null : noticeText(param(searchParams, 'notice'));
  const loginHref = loginPathFor(realm, next);
  return (
    <AuthShell title="Вход по ссылке">
      <p className="mt-3">Укажите почту — мы пришлём ссылку для входа без пароля. Она действует {ttlText(MAGIC_LINK_TTL_SECONDS)}.</p>
      <AuthMessages error={error} notice={notice} />
      <AuthForm action={requestMagicLinkAction} submit="Получить ссылку" pending="Отправляем…">
        <HiddenField name="next" value={next} />
        <AuthField name="email" label="Почта" type="email" autoComplete="email" invalid={Boolean(error)} focus={!notice} />
      </AuthForm>
      <AuthLinks links={[{ href: loginHref, label: 'Войти с паролем' }]} />
    </AuthShell>
  );
}
