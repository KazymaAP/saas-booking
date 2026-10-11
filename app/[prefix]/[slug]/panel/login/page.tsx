// app/[prefix]/[slug]/panel/login/page.tsx — вход владельца (ТЗ §55: /{prefix}/{slug}/panel/login).
import { redirect } from 'next/navigation';
import { signInOwner } from '@/lib/owner-session';

export const metadata = { title: 'Вход в кабинет', robots: { index: false, follow: false } };

export default function OwnerLogin({ params, searchParams }: { params: { prefix: string; slug: string }; searchParams: { error?: string } }) {
  async function login(formData: FormData) {
    'use server';
    const ok = await signInOwner(String(formData.get('email') ?? ''), String(formData.get('password') ?? ''), params.slug);
    if (ok) redirect(`/${params.prefix}/${params.slug}/panel`);
    redirect(`/${params.prefix}/${params.slug}/panel/login?error=1`);
  }
  return (
    <main className="mx-auto mt-16 max-w-[360px] px-4">
      <h1 className="text-[24px] font-semibold">Кабинет</h1>
      {searchParams.error && <p role="alert" className="mt-3 text-[#dc2626]">Неверная почта или пароль</p>}
      <form action={login} className="mt-6 grid gap-3">
        <input name="email" type="email" className="input" placeholder="Email" required autoComplete="username" />
        <input name="password" type="password" className="input" placeholder="Пароль" required autoComplete="current-password" />
        <button type="submit" className="btn-primary">Войти</button>
      </form>
    </main>
  );
}
