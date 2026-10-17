'use client';
// _components/Toast.tsx — тосты результата действий (design-spec §6) с aria-live (ТЗ §19.6).
// Клиентский: состояние очереди и таймеры. Один провайдер на весь кабинет — в layout.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type ToastKind = 'success' | 'error';
type ToastItem = { id: number; kind: ToastKind; text: string };
type ToastApi = { success: (text: string) => void; error: (text: string) => void };

const TOAST_TTL_MS = 4000;
const MAX_TOASTS = 3;
// Снизу по центру на телефоне (под большим пальцем), справа снизу на десктопе. Цвета — контраст ≥ 4.5:1 с белым.
const STACK = 'pointer-events-none fixed inset-x-4 z-50 grid gap-2 md:left-auto md:right-6 md:w-[360px]';

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast: нет ToastProvider выше по дереву');
  return api;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  // Одинаковый тост (например, «Не удалось» после нескольких быстрых действий без сети) не дублируется:
  // старый поднимается в конец очереди с новым id — aria-live объявит его ещё раз, таймер начнётся заново.
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    // Updater чистый (StrictMode вызывает его дважды): таймер старого тоста не трогаем —
    // он сработает и вызовет dismiss по уже удалённому id, это ничего не меняет.
    setItems((list) => [
      ...list.filter((t) => !(t.kind === kind && t.text === text)).slice(-(MAX_TOASTS - 1)),
      { id, kind, text },
    ]);
    timers.current.set(id, setTimeout(() => dismiss(id), TOAST_TTL_MS));
  }, [dismiss]);

  // Таймеры чистим при размонтировании, чтобы не было setState после ухода из кабинета.
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (text) => push('success', text),
    error: (text) => push('error', text),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Два региона: ошибки объявляются немедленно (assertive), успех — вежливо. */}
      <div className={`${STACK} bottom-4`} aria-live="polite" role="status">
        {items.filter((t) => t.kind === 'success').map((t) => <ToastView key={t.id} item={t} onClose={dismiss} />)}
      </div>
      <div className={`${STACK} bottom-20`} aria-live="assertive" role="alert">
        {items.filter((t) => t.kind === 'error').map((t) => <ToastView key={t.id} item={t} onClose={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const close = useCallback(() => onClose(item.id), [onClose, item.id]);
  return (
    <div className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-3 text-[14px] text-white ${item.kind === 'success' ? 'bg-[#15803d]' : 'bg-[#b91c1c]'}`}>
      <span aria-hidden="true" className="font-bold">{item.kind === 'success' ? '✓' : '!'}</span>
      <span className="flex-1">{item.text}</span>
      <button type="button" onClick={close} aria-label="Закрыть уведомление" className="!min-h-[44px] !min-w-[44px] !border-0 !bg-transparent !p-0 text-[20px] leading-none !text-white">×</button>
    </div>
  );
}
