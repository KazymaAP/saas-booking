// app/admin/login/page.tsx — вход супер-админа (ТЗ §5.3: email + пароль, /admin/login).
// Проверки (Origin, rate limit, SUPERADMIN_EMAILS, журнал) — в lib/admin-session.ts.
// В URL после ошибки — только код (?error=invalid) и безопасный путь возврата (?next=/admin/...).
import { redirect } from 'next/navigation';
import { redirectHref } from '@/lib/copy-mode';
import { isSuperAdmin, signInSuperAdmin } from '@/lib/admin-session';
import { sanitizeNext } from '@/lib/auth-core';
import { AUTH_REFERRER_POLICY, errorText, formString, noticeText, param, withQuery, type SearchParams } from '@/lib/auth-forms';
import { ADMIN_HOME } from '@/lib/auth-flow';
import { AuthField, AuthForm, AuthLinks, AuthMessages, AuthShell, HiddenField } from '@/components/auth/AuthUi';

export const metadata = { title: 'Вход — панель', robots: { index: false, follow: false }, referrer: AUTH_REFERRER_POLICY };
export const dynamic = 'force-dynamic';

const LOGIN_PATH = '/admin/login';

async function login(form: FormData): Promise<void> {
  'use server';
  const next = sanitizeNext(formString(form, 'next'), '/admin');
  const result = await signInSuperAdmin(formString(form, 'email'), formString(form, 'password'));
  if (result === 'ok') redirect(next ?? ADMIN_HOME);
  redirect(withQuery(LOGIN_PATH, { error: result, next }));
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const next = sanitizeNext(param(searchParams, 'next'), '/admin');
  // Уже вошёл — сразу в панель (или туда, откуда пришёл). В разделе копий доступ считается
  // открытым, поэтому эта ветка срабатывает всегда — и должна остаться внутри префикса.
  if (await isSuperAdmin()) redirect(redirectHref(next ?? ADMIN_HOME));
  const error = errorText(param(searchParams, 'error'));
  const notice = error ? null : noticeText(param(searchParams, 'reason') ?? param(searchParams, 'notice'));
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <AuthShell title="Вход в панель">
      <AuthMessages error={error} notice={notice} />
      <AuthForm action={login} submit="Войти" pending="Входим…">
        <HiddenField name="next" value={next} />
        <AuthField name="email" label="Почта" type="email" autoComplete="username" invalid={Boolean(error)} focus />
        <AuthField name="password" label="Пароль" type="password" autoComplete="current-password" invalid={Boolean(error)} />
      </AuthForm>
      <AuthLinks links={[
        { href: `/admin/forgot-password${nextQuery}`, label: 'Забыли пароль?' },
        { href: `/magic-link${nextQuery || `?next=${encodeURIComponent(ADMIN_HOME)}`}`, label: 'Войти по ссылке из письма' },
      ]} />
    </AuthShell>
  );
}
