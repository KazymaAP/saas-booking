'use client';
// Подтверждение опасных действий (design-spec §6). Нативный <dialog> + showModal():
// браузер сам держит фокус внутри (focus trap), Esc закрывает, фон недоступен (ТЗ §19.6).
import { useCallback, useEffect, useId, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Esc вызывает событие cancel — синхронизируем состояние родителя.
  const handleCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault();
      onCancel();
    },
    [onCancel],
  );

  return (
    <dialog ref={ref} aria-labelledby={titleId} aria-describedby={textId} onCancel={handleCancel} className="w-[min(420px,calc(100vw-32px))] rounded-[12px] border border-[#e5e5e5] p-5 backdrop:bg-black/30">
      <h2 id={titleId}>{title}</h2>
      <p id={textId} className="text-[14px] text-[#444444]">{text}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} autoFocus>Отмена</button>
        <button type="button" onClick={onConfirm} className="!border-[#dc2626] !text-[#dc2626]">{confirmLabel}</button>
      </div>
    </dialog>
  );
}
