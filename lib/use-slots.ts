// lib/use-slots.ts — React-хуки загрузки слотов для BookingForm и RescheduleForm (только браузер).
// - AbortController: смена даты/услуги отменяет устаревший запрос, ответы не перемешиваются;
// - useTransition: новый список слотов рисуется как неблокирующее обновление, выбор слота остаётся мгновенным;
// - кэш/prefetch из lib/slots-client: дата, на которую навели курсор, открывается без ожидания;
// - skeleton только если загрузка длится дольше SKELETON_DELAY_MS (без мигания на быстрых ответах).
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { sharedSlotsClient, type SlotsFailureReason, type SlotsKey } from './slots-client';

export const SKELETON_DELAY_MS = 300;
export const PENDING_TEXT_DELAY_MS = 200;

export type SlotsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; slots: string[] }
  | { kind: 'error'; reason: SlotsFailureReason; message: string };

const IDLE: SlotsState = { kind: 'idle' };
const LOADING: SlotsState = { kind: 'loading' };

// true, только если flag держится дольше delayMs. Нужен, чтобы не показывать «загрузку» на быстрых ответах.
export function useDelayedFlag(flag: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (flag === false) {
      setShown(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [flag, delayMs]);
  return shown;
}

function keyOf(base: Omit<SlotsKey, 'date' | 'serviceId'>, serviceId: string, date: string): SlotsKey | null {
  if (serviceId.length === 0 || date.length === 0) return null;
  return { prefix: base.prefix, slug: base.slug, serviceId, date };
}

// Слоты для (serviceId, date). reload() — после slot_taken: кэш сбрасывается, список грузится заново.
export function useSlots(site: { prefix: string; slug: string }, serviceId: string, date: string) {
  const { prefix, slug } = site;
  const [state, setState] = useState<SlotsState>(IDLE);
  const [version, setVersion] = useState(0);
  const [isPending, startTransition] = useTransition();
  const keyRef = useRef<SlotsKey | null>(null);

  useEffect(() => {
    const key = keyOf({ prefix, slug }, serviceId, date);
    keyRef.current = key;
    if (key === null) {
      setState(IDLE);
      return undefined;
    }
    const client = sharedSlotsClient();
    const cached = client.peek(key);
    // Из кэша/prefetch — сразу, без состояния загрузки.
    setState(cached === null ? LOADING : { kind: 'ready', slots: cached });
    const controller = new AbortController();
    const run = async (): Promise<void> => {
      const result = await client.load(key, controller.signal);
      if (controller.signal.aborted) return;
      startTransition(() => {
        if (result.ok) setState({ kind: 'ready', slots: result.slots });
        else setState({ kind: 'error', reason: result.reason, message: result.message });
      });
    };
    void run();
    return () => controller.abort();
  }, [prefix, slug, serviceId, date, version]);

  const reload = useCallback(() => {
    if (keyRef.current !== null) sharedSlotsClient().invalidate(keyRef.current);
    setVersion((value) => value + 1);
  }, []);

  const prefetch = useCallback(
    (prefetchDate: string) => {
      const key = keyOf({ prefix, slug }, serviceId, prefetchDate);
      if (key !== null) sharedSlotsClient().prefetch(key);
    },
    [prefix, slug, serviceId],
  );

  const loading = state.kind === 'loading';
  const showSkeleton = useDelayedFlag(loading, SKELETON_DELAY_MS);
  return { state, loading, showSkeleton, isPending, reload, prefetch };
}
