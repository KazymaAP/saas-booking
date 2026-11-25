// _components/PanelHeader.tsx — стеклянная шапка кабинета сервиса, как GlassHeader в супер-админке.
// Серверный: выход — server action из layout, состояние не нужно.
// Слева — кто и в каком кабинете, справа — быстрые переходы: «Моя смена» (сотрудникам) и «Выйти».
import Link from 'next/link';

export function PanelHeader({ businessName, roleLabel, shiftHref, logout, copyMode = false }: {
  businessName: string;
  roleLabel: string;
  shiftHref: string | null;
  // В разделе копий сессии нет — кнопку выхода не показываем вовсе.
  logout?: (() => Promise<void>) | null;
  copyMode?: boolean;
}) {
  const letter = businessName.trim().charAt(0).toUpperCase() || '•';
  return (
    <header className="glass mb-6 flex items-center justify-between gap-3 px-4 py-3 md:px-5">
      {/* На мобильном имя бизнеса уже есть в верхней полосе рядом с бургером — не дублируем. */}
      <div className="hidden min-w-0 items-center gap-3 md:flex">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-semibold text-white"
        >
          {letter}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[14px] font-semibold text-white">{businessName}</span>
          <span className="truncate text-[12px] text-white/50">{roleLabel}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {shiftHref && (
          <Link
            href={shiftHref}
            prefetch={null}
            className="glass-btn !min-h-[36px] !px-3 !text-[13px] !no-underline"
          >
            Моя смена
          </Link>
        )}
        {copyMode ? (
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] text-white/70">
            Копия · только просмотр
          </span>
        ) : (
          logout && (
            <form action={logout}>
              <button type="submit" className="glass-btn !min-h-[36px] !px-3 !text-[13px]">Выйти</button>
            </form>
          )
        )}
      </div>
    </header>
  );
}
