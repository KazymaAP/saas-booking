'use client';
// главная/components/GlassHeader.tsx — стеклянная шапка супер-админки: поиск, уведомления, аватар.
// Иконки Phosphor (уже в проекте); на lucide-react перейдём после установки пакета.
import { Bell, MagnifyingGlass } from '@phosphor-icons/react';

export function GlassHeader({ userInitials = 'СА' }: { userInitials?: string }) {
  return (
    <header className="glass mb-6 flex items-center justify-between gap-4 px-4 py-3 md:px-5">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60 md:max-w-[360px]">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <span className="sr-only">Поиск</span>
        <input
          type="search"
          placeholder="Поиск по разделам…"
          className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/40"
        />
      </label>
      <div className="flex shrink-0 items-center gap-3">
        <button type="button" aria-label="Уведомления" className="glass-btn !min-h-[40px] !w-10 !p-0">
          <Bell size={18} aria-hidden="true" />
        </button>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-semibold text-white"
        >
          {userInitials}
        </span>
      </div>
    </header>
  );
}
