'use server';
// app/[prefix]/[slug]/admin/password/actions.ts — смена временного пароля владельцем кабинета.
// Пароль ставится по сессии (auth_user_id из cookie), а не по email из формы: подставить
// чужой адрес нельзя. После успеха флаг must_change_password снимается, кабинет открывается.
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/auth-session';
import { setUserPassword } from '@/lib/auth-provider';
import { adminClient } from '@/lib/supabase';
import { requestContext } from '@/lib/auth-request';
import { formString, withQuery } from '@/lib/auth-forms';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-core';
import { authEvent } from '@/lib/auth-audit';

// Верхняя граница как в Supabase Auth: длиннее — провайдер всё равно отклонит.
const PASSWORD_MAX_LENGTH = 72;

export async function changeOwnPasswordAction(base: string, form: FormData): Promise<void> {
  const page = `${base}/password`;
  const state = await readSession('owner');
  if (state.kind !== 'active') redirect(`${base}/login`);

  const ctx = requestContext();
  if (!ctx.sameOrigin) {
    await authEvent('csrf_rejected', { realm: 'owner', ip: ctx.ip, reason: 'password_change' });
    redirect(withQuery(page, { error: 'forbidden_origin' }));
  }

  const password = formString(form, 'password');
  if (password !== formString(form, 'confirm')) redirect(withQuery(page, { error: 'mismatch' }));
  if (password.length < PASSWORD_MIN_LENGTH) redirect(withQuery(page, { error: 'too_short' }));
  if (password.length > PASSWORD_MAX_LENGTH) redirect(withQuery(page, { error: 'too_long' }));

  const ok = await setUserPassword(state.claims.sub, password);
  if (!ok) {
    await authEvent('password_change_failed', { realm: 'owner', ip: ctx.ip });
    redirect(withQuery(page, { error: 'error' }));
  }

  // Флаг снимаем по auth_user_id: сессия уже подтверждена, отдельный запрос за членством не нужен.
  const { error } = await adminClient()
    .from('admin_users')
    .update({ must_change_password: false })
    .eq('auth_user_id', state.claims.sub);
  // Если обновление не прошло, кабинет останется закрытым — это безопаснее, чем пустить со старым паролем.
  if (error) redirect(withQuery(page, { error: 'error' }));

  await authEvent('password_changed', { realm: 'owner', ip: ctx.ip });
  redirect(base);
}
