'use client';
// team/CredentialsCard.tsx — одноразовый показ логина и пароля нового менеджера.
// Пароль нигде не сохраняется: только props → закрыли карточку или ушли со страницы — пароля больше нет.
import { useCallback, useEffect, useRef } from 'react';
import { CopyButton } from '../_components/CopyButton';
import type { InviteResult } from './schema';

export function CredentialsCard({ result, onClose }: { result: InviteResult; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const login = result.member.email ?? '';

  // Переносим фокус на карточку: диктор прочтёт её, а клавиатура сразу попадёт к «Скопировать».
  useEffect(() => { ref.current?.focus(); }, []);

  // Адрес кабинета берём в момент клика (window есть только в браузере) — менеджеру не придётся его искать.
  const credentialsText = useCallback(() => {
    const panelUrl = `${window.location.origin}${window.location.pathname.replace(/\/team\/?$/, '')}`;
    return `Кабинет: ${panelUrl}\nЛогин: ${login}\nПароль: ${result.password}`;
  }, [login, result.password]);

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="cred-title" className="grid gap-2 rounded-xl border border-[#86efac] bg-[#f0fdf4] p-4 text-[14px] text-[#14532d] outline-none">
      <h2 id="cred-title" className="!mb-0">Доступ создан</h2>
      <p className="!mb-0">Передайте данные менеджеру. Пароль показывается один раз — после закрытия его не восстановить.</p>
      <dl className="grid gap-1 sm:grid-cols-[80px_1fr]">
        <dt>Логин</dt><dd className="!m-0 select-all break-all font-medium">{login}</dd>
        <dt>Пароль</dt><dd className="!m-0"><code className="select-all break-all text-[16px] font-semibold">{result.password}</code></dd>
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row">
        <CopyButton text={credentialsText} describe="адрес кабинета, логин и пароль" className="btn-primary" />
        <button type="button" onClick={onClose} className="!min-h-[44px]">Я передал, скрыть</button>
      </div>
    </section>
  );
}
