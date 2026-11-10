'use client';
// _components/OnboardingTip.tsx — подсказка новичку, показывается один раз (ТЗ §13.13, §19.1: «тултипы через localStorage»).
// Клиентский: localStorage есть только в браузере. На сервере и до гидрации ничего не рендерим —
// иначе подсказка мелькнёт у того, кто её уже закрыл. Ключ включает slug: у разных бизнесов — свои подсказки.
import { useCallback, useEffect, useState } from 'react';
import { tipStorageKey, type TipKey } from '../_lib/tips';

export function OnboardingTip({ slug, tip, title, children }: { slug: string; tip: TipKey; title: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const key = tipStorageKey(slug, tip);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(key) === null);
    } catch {
      // Приватный режим Safari / запрет cookies: хранилища нет — подсказку не показываем, чтобы не надоедать каждый раз.
      setVisible(false);
    }
  }, [key]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(key, String(Date.now()));
    } catch {
      // Не удалось запомнить — подсказка просто скрыта до перезагрузки.
    }
  }, [key]);

  if (!visible) return null;
  return (
    <aside
      aria-label={title}
      className="flex items-start gap-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-4 text-[14px] text-[#1e3a8a]"
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
      </svg>
      <div className="grid flex-1 gap-1">
        <p className="!mb-0 font-semibold">{title}</p>
        <div>{children}</div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="!min-h-[44px] shrink-0 !border-[#bfdbfe] !bg-[var(--surface)] !text-[#1e3a8a]"
      >
        Понятно
      </button>
    </aside>
  );
}
