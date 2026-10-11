// lib/admin-session.ts — вход супер-админа (ТЗ §16, §5.4): email + пароль через Supabase Auth.
// Доступ только для адресов из SUPERADMIN_EMAILS (через запятую). Сессия: httpOnly-cookie, 30 дней (§0.3).
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const SESSION_COOKIE = 'sa_session';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function superAdmins(): string[] {
  return (process.env.SUPERADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function signInSuperAdmin(email: string, password: string): Promise<boolean> {
  if (!superAdmins().includes(email.toLowerCase())) {
    console.warn(`[login] ${email}: нет в SUPERADMIN_EMAILS (список: ${superAdmins().length} адрес(ов))`);
    return false;
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.warn(`[login] ${email}: отказ Supabase Auth: ${error?.message ?? 'нет сессии'}`);
    return false;
  }
  cookies().set(SESSION_COOKIE, data.session.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
  });
  return true;
}

export async function isSuperAdmin(): Promise<boolean> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await db.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  return Boolean(email && superAdmins().includes(email));
}

export function signOutSuperAdmin(): void {
  cookies().delete(SESSION_COOKIE);
}
