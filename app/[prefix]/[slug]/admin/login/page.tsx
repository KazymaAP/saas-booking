// app/[prefix]/[slug]/admin/login/page.tsx — вход владельца/менеджера (ТЗ §5.3: /{prefix}/{slug}/admin/login).
// На кастомном домене middleware переписывает /admin/login сюда: ссылки и редиректы строятся от ownerBasePath,
// а страницы /magic-link и /admin/forgot-password живут на основном домене (SITE_URL) — сессия там своя (§5.8).
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { ownerAccess, ownerPanelInfo, signInOwner } from '@/lib/owner-session';
import { sanitizeNext } from '@/lib/auth-core';
import { requestContext, ownerBasePath } from '@/lib/auth-request';
import { AUTH_REFERRER_POLICY, errorText, formString, noticeText, param, withQuery, type SearchParams } from '@/lib/auth-forms';
import { SITE_URL } from '@/lib/site';
import { AuthField, AuthForm, AuthLinks, AuthMessages, AuthShell, HiddenField } from '@/components/auth/AuthUi';

export const metadata = { title: 'Вход в кабинет', robots: { index: false, follow: false }, referrer: AUTH_REFERRER_POLICY };
export const dynamic = 'force-dynamic';

type Params = { readonly prefix: string; readonly slug: string };

export default async function OwnerLogin({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const info = await ownerPanelInfo(params.slug);
  if (!info) notFound();
  // Кабинет живёт под префиксом своей ниши: /b/2bro/admin/login → /d/2bro/admin/login.
  if (info.canonicalPrefix !== params.prefix) {
    permanentRedirect(`/${info.canonicalPrefix}/${params.slug}/admin/login`);
  }
  const ctx = requestContext();
  const base = ownerBasePath(params.prefix, params.slug, ctx);
  const next = sanitizeNext(param(searchParams, 'next'), base);
  // Уже вошёл в этот кабинет — сразу внутрь.
  if ((await ownerAccess(params.slug)).kind === 'ok') redirect(next ?? base);

  async function login(form: FormData): Promise<void> {
    'use server';
    const formNext = sanitizeNext(formString(form, 'next'), base);
    const result = await signInOwner(formString(form, 'email'), formString(form, 'password'), params.slug);
    if (result === 'ok') redirect(formNext ?? base);
    redirect(withQuery(`${base}/login`, { error: result, next: formNext }));
  }

  const error = errorText(param(searchParams, 'error'));
  const notice = error ? null : noticeText(param(searchParams, 'reason') ?? param(searchParams, 'notice'));
  // Беспарольные сценарии всегда на основном домене и знают кабинет по его каноническому пути.
  const mainPanel = `/${params.prefix}/${params.slug}/admin`;
  const authBase = ctx.mainHost ? '' : SITE_URL;
  const nextQuery = `?next=${encodeURIComponent(mainPanel)}`;
  return (
    <AuthShell title={`Кабинет «${info.name}»`}>
      <AuthMessages error={error} notice={notice} />
      <AuthForm action={login} submit="Войти" pending="Входим…">
        <HiddenField name="next" value={next} />
        {/* Логин, а не почта: короткое имя разворачивается во внутренний адрес кабинета. */}
        <AuthField name="email" label="Логин" type="text" autoComplete="username" invalid={Boolean(error)} focus />
        <AuthField name="password" label="Пароль" type="password" autoComplete="current-password" invalid={Boolean(error)} />
      </AuthForm>
      <AuthLinks links={[
        { href: `${authBase}/admin/forgot-password${nextQuery}`, label: 'Забыли пароль?' },
        { href: `${authBase}/magic-link${nextQuery}`, label: 'Войти по ссылке из письма' },
      ]} />
    </AuthShell>
  );
}
