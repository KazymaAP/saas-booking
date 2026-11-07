'use client';
// Тосты супер-админки: результат действия, ошибки сервера, отчёт массовых операций (design-spec §6).
// Регион aria-live объявляет сообщения скринридеру; ошибки — role="alert" (ТЗ §19.6).
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; text: string };
type ToastApi = { show: (text: string, kind?: ToastKind) => void };

const ToastContext = createContext<ToastApi>({ show: () => undefined });
const HIDE_AFTER_MS = 5000;
const MAX_VISIBLE = 4;

const KIND_CLASS: Record<ToastKind, string> = {
  success: 'border-[#16a34a]',
  error: 'border-[#dc2626]',
  info: 'border-[#e5e5e5]',
};
const KIND_PREFIX: Record<ToastKind, string> = { success: 'Готово', error: 'Ошибка', info: 'Инфо' };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (text: string, kind: ToastKind = 'info') => {
      seq.current += 1;
      const id = seq.current;
      setItems((list) => [...list.slice(-(MAX_VISIBLE - 1)), { id, kind, text }]);
      window.setTimeout(() => dismiss(id), HIDE_AFTER_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 grid w-[min(360px,calc(100vw-32px))] gap-2" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onClose={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const close = useCallback(() => onClose(item.id), [onClose, item.id]);
  return (
    <div role={item.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-[12px] border-l-4 bg-white p-3 text-[14px] shadow-md ${KIND_CLASS[item.kind]}`}>
      <p className="m-0 flex-1"><span className="sr-only">{KIND_PREFIX[item.kind]}: </span>{item.text}</p>
      <button type="button" onClick={close} aria-label="Закрыть уведомление" className="min-h-0 border-0 px-1 py-0">×</button>
    </div>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
