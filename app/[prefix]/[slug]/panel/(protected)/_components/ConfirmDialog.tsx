'use client';
// _components/ConfirmDialog.tsx — подтверждение опасных действий (design-spec §6, ТЗ §19.6).
// Нативный <dialog> + showModal(): фокус заперт внутри, Esc закрывает, фон недоступен — без библиотек.
// Хук возвращает функцию confirm(), которая резолвится true/false — удобно внутри обработчиков.
import { useCallback, useEffect, useId, useRef, useState } from 'react';

type ConfirmOptions = { title: string; text?: string; confirmLabel: string; danger?: boolean };


export function useConfirm(): [(opts: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  // resolve храним в ref: updater setState должен быть чистым (StrictMode вызывает его дважды).
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false); // предыдущий незакрытый диалог считаем отменённым
    resolver.current = resolve;
    setPending(opts);
  }), []);

  const finish = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setPending(null);
  }, []);

  const node = pending ? <ConfirmDialogView options={pending} onFinish={finish} /> : null;
  return [confirm, node];
}

function ConfirmDialogView({ options, onFinish }: { options: ConfirmOptions; onFinish: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();

  // Открываем модально при монтировании; фокус — на «Отмена», чтобы Enter случайно не подтвердил удаление.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Элемент, с которого открыли диалог: вернём на него фокус после закрытия.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.open) el.showModal();
    cancelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  const onCancel = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault(); // Esc: закрываем сами, чтобы зарезолвить промис
    onFinish(false);
  }, [onFinish]);
  const onNo = useCallback(() => onFinish(false), [onFinish]);
  const onYes = useCallback(() => onFinish(true), [onFinish]);
  // Клик по подложке (вне содержимого) = отмена.
  const onBackdrop = useCallback((e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onFinish(false);
  }, [onFinish]);

  return (
    <dialog
      ref={ref}
      onCancel={onCancel}
      onClick={onBackdrop}
      aria-labelledby={titleId}
      aria-describedby={options.text ? textId : undefined}
      className="w-[min(92vw,420px)] rounded-xl border border-[#e5e5e5] p-0 backdrop:bg-black/40"
    >
      <div className="grid gap-3 p-5">
        <h2 id={titleId} className="text-[18px] font-semibold">{options.title}</h2>
        {options.text && <p id={textId} className="text-[14px] text-[#555555]">{options.text}</p>}
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onNo} className="min-h-[44px]">Отмена</button>
          <button
            type="button"
            onClick={onYes}
            className={`min-h-[44px] !text-white ${options.danger ? '!border-[#b91c1c] !bg-[#b91c1c]' : '!border-[var(--brand-color)] !bg-[var(--brand-color)]'}`}
          >
            {options.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
