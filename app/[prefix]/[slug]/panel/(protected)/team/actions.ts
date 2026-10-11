// app/[prefix]/[slug]/panel/(protected)/team/actions.ts — команда: приглашение менеджера, удаление (ТЗ §5.3, §20).
// Только владелец (role=owner) может приглашать и удалять. Менеджер видит брони и не видит биллинг и настройки.
'use server';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';

export async function inviteManager(prefix: string, slug: string, formData: FormData) {
  const access = await currentOwner(slug);
  if (!access || access.member.role !== 'owner') return;
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

  const db = adminClient();
  const password = randomBytes(9).toString('base64url');
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) return;

  await db.from('admin_users').insert({ business_id: access.business.id, email, role: 'manager', auth_user_id: created.user.id });
  await audit('manager_invite', 'business', access.business.id, { email });
  // Пароль передаётся владельцу один раз через cookie на 5 минут (см. lib/flash.ts)
  const { cookies } = await import('next/headers');
  const { FLASH_COOKIE } = await import('@/lib/flash');
  cookies().set(FLASH_COOKIE, JSON.stringify({ email, password }), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/' });
  revalidatePath(`/${prefix}/${slug}/panel/team`);
}

export async function removeMember(prefix: string, slug: string, formData: FormData) {
  const access = await currentOwner(slug);
  if (!access || access.member.role !== 'owner') return;
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const db = adminClient();
  const { data: target } = await db.from('admin_users').select('id, role, auth_user_id').eq('id', id).eq('business_id', access.business.id).maybeSingle();
  if (!target || target.role === 'owner') return; // владельца удалить нельзя
  await db.from('admin_users').delete().eq('id', id);
  if (target.auth_user_id) await db.auth.admin.deleteUser(target.auth_user_id).catch(() => undefined);
  await audit('manager_remove', 'business', access.business.id, { member_id: id });
  revalidatePath(`/${prefix}/${slug}/panel/team`);
}
