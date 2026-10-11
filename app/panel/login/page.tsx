// app/panel/login/page.tsx — вход супер-админа (ТЗ §55: /panel/login).
import { redirect } from 'next/navigation';
import { signInSuperAdmin } from '@/lib/admin-session';

export const metadata = { title: 'Вход — панель', robots: { index: false, follow: false } };

async function login(formData: FormData) {
  'use server';
  const ok = await signInSuperAdmin(String(formData.get('email') ?? ''), String(formData.get('password') ?? ''));
  if (ok) redirect('/panel/funnel');
  redirect('/panel/login?error=1');
}

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="mx-auto mt-16 max-w-[360px] px-4">
      <h1 className="text-[24px] font-semibold">Вход в панель</h1>
      {searchParams.error && <p role="alert" className="mt-3 text-[#dc2626]">Неверная почта или пароль</p>}
      <form action={login} className="mt-6 grid gap-3">
        <input name="email" type="email" className="input" placeholder="Email" required autoComplete="username" />
        <input name="password" type="password" className="input" placeholder="Пароль" required autoComplete="current-password" />
        <button type="submit" className="btn-primary">Войти</button>
      </form>
    </main>
  );
}
