// app/[prefix]/[slug]/admin/password/page.tsx — обязательная смена временного пароля.
//
// Кабинеты, заведённые платформой, получают пароль от нас. Пока владелец не задал свой,
// layout кабинета сюда и переводит: страница лежит вне группы (protected), поэтому
// редирект не зацикливается.
import { notFound, redirect } from 'next/navigation';

import { ownerAccess, ownerPanelInfo } from '@/lib/owner-session';
import { ownerBasePath, requestContext } from '@/lib/auth-request';
import { AUTH_REFERRER_POLICY, errorText, param, type SearchParams } from '@/lib/auth-forms';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-core';
import { AuthField, AuthForm, AuthMessages, AuthShell, PASSWORD_HINT } from '@/components/auth/AuthUi';
import { changeOwnPasswordAction } from './actions';

export const metadata = { title: 'Смена пароля', robots: { index: false, follow: false }, referrer: AUTH_REFERRER_POLICY };
export const dynamic = 'force-dynamic';

type Params = { readonly prefix: string; readonly slug: string };

export default async function SetPasswordPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const info = await ownerPanelInfo(params.prefix, params.slug);
  if (!info) notFound();

  const ctx = requestContext();
  const base = ownerBasePath(params.prefix, params.slug, ctx);
  const access = await ownerAccess(params.slug);
  if (access.kind !== 'ok') redirect(`${base}/login`);
  // Пароль уже свой — форма не нужна.
  if (!access.data.member.must_change_password) redirect(base);

  const errorCode = param(searchParams, 'error');
  const error = errorText(errorCode);
  return (
    <AuthShell title={`Кабинет «${info.name}»`}>
      <p className="mt-3">
        Пароль для первого входа выдал сервис. Придумайте свой — им вы будете входить дальше.
        Пока пароль не сменён, остальные разделы кабинета закрыты.
      </p>
      <AuthMessages error={error} />
      <AuthForm
        action={changeOwnPasswordAction.bind(null, base)}
        submit="Сохранить пароль"
        pending="Сохраняем…"
      >
        <AuthField
          name="password"
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          hint={PASSWORD_HINT}
          invalid={errorCode === 'too_short' || errorCode === 'too_long'}
          focus
        />
        <AuthField
          name="confirm"
          label="Новый пароль ещё раз"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          invalid={errorCode === 'mismatch'}
        />
      </AuthForm>
    </AuthShell>
  );
}
