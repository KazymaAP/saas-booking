// app/auth/page.tsx — единая страница входа/регистрации (предприниматель или партнёр).
import { AuthCard } from './AuthCard';

export const metadata = {
  title: 'Вход и регистрация — Запишись',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AuthPage({ searchParams }: { searchParams: { mode?: string; role?: string; ref?: string } }) {
  // ?ref=PR-XXXX — приглашение от партнёра: новый партнёр сразу привязывается к наставнику.
  const initialMode = searchParams.mode === 'register' ? 'register' : 'login';
  const initialRole = searchParams.role === 'partner' || searchParams.ref ? 'partner' : 'entrepreneur';
  const referrerCode = (searchParams.ref ?? '').trim().toUpperCase().slice(0, 32) || null;
  return <AuthCard initialMode={initialMode} initialRole={initialRole} referrerCode={referrerCode} />;
}
