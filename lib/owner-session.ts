// lib/owner-session.ts — вход владельца/менеджера бизнеса (ТЗ §5.3, §16, §20).
// Email + пароль через Supabase Auth. Доступ проверяется на каждом запросе: пользователь должен быть
// в admin_users для этого бизнеса (роль owner или manager). Cookie одна, права — всегда по БД.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { adminClient } from './supabase';
import type { AdminUser, Business } from './database.types';

export const OWNER_COOKIE = 'biz_session';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function anonClient(token?: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

export async function signInOwner(email: string, password: string, slug: string): Promise<boolean> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) return false;

  // Проверяем, что пользователь действительно состоит в бизнесе с этим slug.
  const { data: business } = await adminClient().from('businesses').select('id').eq('slug', slug).maybeSingle();
  if (!business) return false;
  const { data: member } = await adminClient()
    .from('admin_users').select('id').eq('business_id', business.id).eq('auth_user_id', data.user.id).maybeSingle();
  if (!member) return false;

  cookies().set(OWNER_COOKIE, data.session.access_token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS,
  });
  return true;
}

// Возвращает бизнес и роль, если текущая сессия имеет доступ к бизнесу со slug, иначе null.
async function currentOwnerUncached(slug: string): Promise<{ business: Business; member: AdminUser } | null> {
  const token = cookies().get(OWNER_COOKIE)?.value;
  if (!token) return null;
  const { data: userData } = await anonClient(token).auth.getUser(token);
  const userId = userData.user?.id;
  if (!userId) return null;

  const db = adminClient();
  const { data: business } = await db.from('businesses').select('*').eq('slug', slug).maybeSingle();
  if (!business || business.status !== 'client') return null;
  const { data: member } = await db
    .from('admin_users').select('*').eq('business_id', business.id).eq('auth_user_id', userId).maybeSingle();
  if (!member) return null;
  return { business: business as Business, member: member as AdminUser };
}

// Кэш в рамках одного запроса: layout и страница не делают повторных запросов к базе.
export const currentOwner = cache(currentOwnerUncached);

export function signOutOwner(): void {
  cookies().delete(OWNER_COOKIE);
}
