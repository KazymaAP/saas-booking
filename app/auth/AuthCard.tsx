'use client';

import { useState, type FormEvent } from 'react';
import { CaretLeft, Storefront, UsersThree } from '@phosphor-icons/react';
import {
  loginAction,
  registerAction,
  requestCodeAction,
  resetPasswordAction,
  type AuthActionResult,
} from './actions';

type Mode = 'login' | 'register' | 'forgot' | 'reset';
type Role = 'entrepreneur' | 'partner';

const inputClass =
  'box-border mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-indigo-500';

export function AuthCard({
  initialMode = 'login',
  initialRole = 'entrepreneur',
  referrerCode = null,
}: {
  initialMode?: Mode;
  initialRole?: Role;
  /** Код пригласившего партнёра: показываем плашку и передаём при регистрации. */
  referrerCode?: string | null;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [role, setRole] = useState<Role>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
    setCode('');
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let result: AuthActionResult;
      if (mode === 'register') result = await registerAction({ role, name, email, password, referrerCode });
      else if (mode === 'login') result = await loginAction(email, password);
      else if (mode === 'forgot') result = await requestCodeAction(email);
      else result = await resetPasswordAction(email, code, password);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.redirect) {
        // Полная навигация, а не router.push: серверный экшен только что выставил cookie сессии,
        // и клиентский переход успевал уйти раньше, чем браузер её сохранит — пользователь оставался
        // на форме входа с «успешным» ответом. Перезагрузка гарантированно несёт новую cookie.
        window.location.assign(result.redirect);
        return;
      }
      setMessage(result.message ?? 'Готово');
      if (mode === 'forgot') {
        setMode('reset');
        setCode('');
        setPassword('');
      } else if (mode === 'reset') {
        setMode('login');
        setCode('');
        setPassword('');
      } else if (mode === 'register' && role === 'entrepreneur') {
        setName('');
        setPassword('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить запрос');
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'register' ? 'Регистрация' :
    mode === 'forgot' ? 'Восстановление пароля' :
    mode === 'reset' ? 'Введите код из письма' :
    'Вход';

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-600 text-lg font-semibold text-white">З</div>
          <h1 className="mt-3 text-2xl font-semibold text-white">Запишись</h1>
          <p className="mt-1 text-sm text-zinc-400">Сайт с онлайн-записью для бизнеса</p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {(mode === 'forgot' || mode === 'reset') && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-1 border-0 bg-transparent text-xs text-zinc-300 transition-colors hover:text-white"
              >
                <CaretLeft size={14} weight="bold" aria-hidden="true" /> Ко входу
              </button>
            )}
          </div>

          {error && <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>}
          {message && <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{message}</div>}

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <span className="block text-xs font-medium text-zinc-400">Кто вы</span>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('entrepreneur')}
                      aria-pressed={role === 'entrepreneur'}
                      className={`rounded-2xl border p-3 text-left transition-colors ${role === 'entrepreneur' ? 'border-indigo-400 bg-indigo-500/20' : 'border-zinc-600 bg-zinc-800/60 hover:border-zinc-400 hover:bg-zinc-800'}`}
                    >
                      <Storefront size={20} weight="bold" className={role === 'entrepreneur' ? 'text-indigo-200' : 'text-zinc-200'} aria-hidden="true" />
                      <div className="mt-2 text-sm font-medium text-white">Предприниматель</div>
                      <div className="text-[11px] leading-4 text-zinc-300">Хочу сайт с записью</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('partner')}
                      aria-pressed={role === 'partner'}
                      className={`rounded-2xl border p-3 text-left transition-colors ${role === 'partner' ? 'border-indigo-400 bg-indigo-500/20' : 'border-zinc-600 bg-zinc-800/60 hover:border-zinc-400 hover:bg-zinc-800'}`}
                    >
                      <UsersThree size={20} weight="bold" className={role === 'partner' ? 'text-indigo-200' : 'text-zinc-200'} aria-hidden="true" />
                      <div className="mt-2 text-sm font-medium text-white">Партнёр</div>
                      <div className="text-[11px] leading-4 text-zinc-300">Привожу клиентов</div>
                    </button>
                  </div>
                </div>

                <label className="block text-xs font-medium text-zinc-400">
                  Имя
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Иван"
                    autoComplete="name"
                    className={inputClass}
                  />
                </label>
              </>
            )}

            <label className="block text-xs font-medium text-zinc-400">
              Почта
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="you@example.ru"
                autoComplete="email"
                className={inputClass}
              />
            </label>

            {mode === 'reset' && (
              <label className="block text-xs font-medium text-zinc-400">
                Код из письма
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  className={`${inputClass} tracking-[0.4em]`}
                />
              </label>
            )}

            {mode !== 'forgot' && (
              <label className="block text-xs font-medium text-zinc-400">
                {mode === 'reset' ? 'Новый пароль' : 'Пароль'}
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  minLength={8}
                  placeholder="Не короче 8 символов"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className={inputClass}
                />
              </label>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="border-0 bg-transparent text-xs font-medium text-indigo-400 underline underline-offset-2 transition-colors hover:text-indigo-300"
                >
                  Забыл пароль
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl border-0 bg-indigo-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy
                ? 'Подождите…'
                : mode === 'register'
                  ? 'Регистрация'
                  : mode === 'forgot'
                    ? 'Отправить код'
                    : mode === 'reset'
                      ? 'Сбросить пароль'
                      : 'Войти'}
            </button>
          </form>

          <div className="mt-4 border-t border-zinc-800 pt-4">
            {mode === 'register' ? (
              <button type="button" onClick={() => switchMode('login')} className="w-full rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700">
                Войти
              </button>
            ) : mode === 'login' ? (
              <button type="button" onClick={() => switchMode('register')} className="w-full rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700">
                Регистрация
              </button>
            ) : (
              <button type="button" onClick={() => switchMode('login')} className="w-full rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700">
                Вернуться ко входу
              </button>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] leading-4 text-zinc-400">
            {mode === 'register' && role === 'entrepreneur'
              ? 'После регистрации мы свяжемся с вами и активируем сайт.'
              : mode === 'register'
                ? 'Партнёр получает доступ к готовым сайтам и вознаграждению.'
                : 'Код действует 10 минут.'}
          </p>
        </div>
      </div>
    </main>
  );
}
