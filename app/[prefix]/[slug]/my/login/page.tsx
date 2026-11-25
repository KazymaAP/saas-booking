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

  // Оболочка .panel-shell, как у остальных входов: без неё у <button> остаётся
  // браузерная рамка (preflight отключён), и переключатель способа входа выглядел
  // как две кнопки из 1998 года. Утилиты цвета помечены ! — правило
  // `.panel-shell button:not([type=submit])` специфичнее обычного класса.
  const tab = (active: boolean) =>
    `min-h-[36px] rounded-full border px-3 text-[13px] font-medium transition-colors ${
      active
        ? '!border-[#111] !bg-[#111] !text-white'
        : '!border-[#e5e5e5] !bg-transparent !text-[#525252] hover:!border-[#bdbdbd]'
    }`;
  const input = 'input w-full';
  const submit = 'btn-primary min-h-[44px] w-full !border-[#111] !bg-[#111] !text-white';

  return (
    <main className="panel-shell flex min-h-screen w-full flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <h1 className="text-[24px] font-semibold">Вход в кабинет</h1>
        <p className="mt-1 text-[13px] text-[#737373]">Войдите по коду из письма или по паролю, если задали его при записи.</p>

        <div className="mt-5 flex gap-2" role="tablist" aria-label="Способ входа">
          <button type="button" role="tab" aria-selected={mode === 'otp'} onClick={() => setMode('otp')} className={tab(mode === 'otp')}>
            По коду из email
          </button>
          <button type="button" role="tab" aria-selected={mode === 'password'} onClick={() => setMode('password')} className={tab(mode === 'password')}>
            По паролю
          </button>
        </div>

        {mode === 'otp' ? (
          <form onSubmit={onSubmitOtp} className="mt-5 grid gap-3">
            <label htmlFor="my-login-email" className="text-[14px] font-medium">Email, указанный при записи</label>
            <input
              id="my-login-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
              disabled={codeSent}
            />
            {codeSent && (
              <>
                <label htmlFor="my-login-code" className="text-[14px] font-medium">Код из письма</label>
                <input
                  id="my-login-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  placeholder="6 цифр"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={input}
                />
              </>
            )}
            <button type="submit" disabled={busy} className={submit}>
              {busy ? '…' : codeSent ? 'Войти' : 'Получить код'}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitPassword} className="mt-5 grid gap-3">
            <label htmlFor="my-login-email-pw" className="text-[14px] font-medium">Email</label>
            <input
              id="my-login-email-pw"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
            <label htmlFor="my-login-password" className="text-[14px] font-medium">Пароль</label>
            <input
              id="my-login-password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
            <button type="submit" disabled={busy} className={submit}>
              {busy ? '…' : 'Войти'}
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-[14px] text-[#b91c1c]" role="alert">{error}</p>}
        {message && <p className="mt-4 text-[14px] text-[#15803d]" role="status">{message}</p>}
      </div>
    </main>
  );
}
