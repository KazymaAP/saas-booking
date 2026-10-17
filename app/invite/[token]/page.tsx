// app/invite/[token]/page.tsx — страница приглашения в кабинет (ТЗ §5.3, §5.6: /invite/{token}).
// GET только показывает форму и не гасит приглашение (почтовые сканеры открывают ссылки сами).
// Приглашение принимается POST-ом формы (actions.ts). Токен в адресе не утекает через Referer: политика strict-origin (lib/auth-forms.ts).
import { peekInvite } from '@/lib/auth-invites';
import { ROLE_GENITIVE } from '@/lib/auth-roles';
import { AUTH_REFERRER_POLICY, errorText, param, type SearchParams } from '@/lib/auth-forms';
import { INVITE_TTL_SECONDS, PASSWORD_MIN_LENGTH, ttlText } from '@/lib/auth-core';
import { AuthField, AuthForm, AuthMessages, AuthShell, HiddenField, PASSWORD_HINT } from '@/components/auth/AuthUi';
import { acceptInviteAction } from './actions';

export const metadata = { title: 'Приглашение в кабинет', robots: { index: false, follow: false }, referrer: AUTH_REFERRER_POLICY };
export const dynamic = 'force-dynamic';

const STATE_TEXT = {
  expired: `Срок действия приглашения истёк (${ttlText(INVITE_TTL_SECONDS)}). Попросите владельца кабинета отправить новое.`,
  used: 'Это приглашение уже использовано. Если это были вы — войдите в кабинет со своим паролем.',
  not_found: 'Приглашение не найдено. Проверьте ссылку из письма или попросите отправить новое.',
} as const;

export default async function InvitePage({ params, searchParams }: { params: { token: string }; searchParams: SearchParams }) {
  const invite = await peekInvite(params.token);
  if (invite.state !== 'valid' || !invite.email || !invite.role) {
    const text = invite.state === 'valid' ? STATE_TEXT.not_found : STATE_TEXT[invite.state];
    return (
      <AuthShell title="Приглашение недоступно">
        <p role="alert" className="mt-3">{text}</p>
      </AuthShell>
    );
  }
  const errorCode = param(searchParams, 'error');
  const error = errorText(errorCode);
  const passwordError = Boolean(error) && errorCode !== 'rate_limited';
  return (
    <AuthShell title={`Кабинет «${invite.businessName ?? 'бизнеса'}»`}>
      <p className="mt-3">
        Вас пригласили с правами {ROLE_GENITIVE[invite.role]}. Задайте пароль — им вы будете входить в кабинет.
        Если у вас уже есть учётная запись с этой почтой, введите её текущий пароль.
      </p>
      <AuthMessages error={error} />
      <AuthForm action={acceptInviteAction} submit="Принять приглашение" pending="Сохраняем…">
        <HiddenField name="token" value={params.token} />
        <AuthField name="email" label="Почта" type="email" autoComplete="username" defaultValue={invite.email} readOnly />
        <AuthField name="password" label="Пароль" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH}
          hint={PASSWORD_HINT} invalid={passwordError} focus />
        <AuthField name="confirm" label="Пароль ещё раз" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH}
          invalid={errorCode === 'mismatch'} />
      </AuthForm>
    </AuthShell>
  );
}
