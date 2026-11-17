// app/[prefix]/[slug]/my/login/page.tsx — вход клиента в кабинет /my (NEW-5, 2026-11-12).
// ВРЕМЕННАЯ форма: будет заменена на единый /{prefix}/{slug}/login в NEW-6 (объединённый вход
// клиента, владельца и сотрудника). Логика входа — server actions из ./actions.ts.
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  customerPasswordLoginAction,
  requestCustomerCodeAction,
  verifyCustomerCodeAction,
  type CustomerActionResult,
} from '../actions';

type Mode = 'otp' | 'password';

export default function CustomerLoginPage({ params }: { params: { prefix: string; slug: string } }) {
  const router = useRouter();
  const { prefix, slug } = params;
  const base = `/${prefix}/${slug}/my`;

  const [mode, setMode] = useState<Mode>('otp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  async function run(fn: () => Promise<CustomerActionResult>): Promise<boolean> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      if (res.message) setMessage(res.message);
      return true;
    } catch {
      setError('Не удалось выполнить запрос. Попробуйте ещё раз.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (codeSent) {
      const ok = await run(() => verifyCustomerCodeAction({ prefix, slug, email, code }));
      if (ok) router.push(base);
    } else {
      const ok = await run(() => requestCustomerCodeAction({ prefix, slug, email }));
      if (ok) setCodeSent(true);
    }
  }

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() => customerPasswordLoginAction({ prefix, slug, email, password }));
    if (ok) router.push(base);
  }

  return (
    <main className="mx-auto max-w-[420px] px-4 py-12">
      <h1 className="text-[24px] font-semibold">Вход в кабинет</h1>
      <p className="mt-1 text-[13px] text-[#737373]">Войдите по коду из письма или по паролю, если задали его при записи.</p>

      <div className="mt-5 flex gap-2 text-[14px]">
        <button type="button" onClick={() => setMode('otp')} className={mode === 'otp' ? 'font-semibold underline' : 'text-[#737373]'}>
          По коду из email
        </button>
        <button type="button" onClick={() => setMode('password')} className={mode === 'password' ? 'font-semibold underline' : 'text-[#737373]'}>
          По паролю
        </button>
      </div>

      {mode === 'otp' ? (
        <form onSubmit={onSubmitOtp} className="mt-5 grid gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[44px] rounded-md border border-[#e5e5e5] px-3"
            disabled={codeSent}
          />
          {codeSent && (
            <input
              inputMode="numeric"
              required
              placeholder="Код из письма (6 цифр)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="min-h-[44px] rounded-md border border-[#e5e5e5] px-3"
            />
          )}
          <button type="submit" disabled={busy} className="min-h-[44px] rounded-md bg-[var(--accent,#111)] px-5 text-white">
            {busy ? '…' : codeSent ? 'Войти' : 'Получить код'}
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmitPassword} className="mt-5 grid gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[44px] rounded-md border border-[#e5e5e5] px-3"
          />
          <input
            type="password"
            required
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-[44px] rounded-md border border-[#e5e5e5] px-3"
          />
          <button type="submit" disabled={busy} className="min-h-[44px] rounded-md bg-[var(--accent,#111)] px-5 text-white">
            {busy ? '…' : 'Войти'}
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-[14px] text-[#b91c1c]" role="alert">{error}</p>}
      {message && <p className="mt-4 text-[14px] text-[#15803d]">{message}</p>}
    </main>
  );
}
