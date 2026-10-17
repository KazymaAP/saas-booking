'use client';
// Отправка переноса: useOptimistic (кнопка блокируется в том же кадре, откат при ошибке) + useTransition.
// slot_taken → сброс выбранного времени, перезагрузка слотов, счётчик обновлений (для aria-live «список обновлён»).
import { useCallback, useOptimistic, useRef, useState, useTransition } from 'react';
import { browserBookingClient, type ClientFailure } from '@/lib/booking-client';
import type { RescheduleResponse } from '@/lib/schemas';

const HOUR_MS = 3_600_000;

export type RescheduleOutcome =
  | { kind: 'none' }
  | { kind: 'done'; result: RescheduleResponse }
  | { kind: 'failed'; failure: ClientFailure };

type Options = {
  token: string;
  minHoursBefore: number;
  onSlotTaken: () => void;
};

// Клиентская проверка «слот протух» (страница провисела открытой): та же ошибка, что вернул бы сервер.
function staleFailure(): ClientFailure {
  return { ok: false, reason: 'slot_taken', message: 'Это время уже недоступно. Выберите другое.' };
}

export function useRescheduleSubmit({ token, minHoursBefore, onSlotTaken }: Options) {
  const [outcome, setOutcome] = useState<RescheduleOutcome>({ kind: 'none' });
  const [refreshCount, setRefreshCount] = useState(0);
  const [phase, setPhase] = useOptimistic<'idle' | 'sending', 'idle' | 'sending'>('idle', (_current, next) => next);
  const [, startTransition] = useTransition();
  // Синхронная защита от двойного клика до первого рендера с phase='sending'.
  const inFlight = useRef(false);

  const slotTaken = useCallback(
    (failure: ClientFailure) => {
      setOutcome({ kind: 'failed', failure });
      setRefreshCount((value) => value + 1);
      onSlotTaken();
    },
    [onSlotTaken],
  );

  const submit = useCallback(
    (date: string, startsAt: string) => {
      if (inFlight.current || date.length === 0 || startsAt.length === 0) return;
      if (Date.parse(startsAt) < Date.now() + minHoursBefore * HOUR_MS) {
        slotTaken(staleFailure());
        return;
      }
      inFlight.current = true;
      setOutcome({ kind: 'none' });
      startTransition(async () => {
        setPhase('sending');
        const result = await browserBookingClient().reschedule(token, { date, startsAt });
        inFlight.current = false;
        if (result.ok) setOutcome({ kind: 'done', result: result.value });
        else if (result.reason === 'slot_taken') slotTaken(result);
        else setOutcome({ kind: 'failed', failure: result });
      });
    },
    [token, minHoursBefore, slotTaken, setPhase],
  );

  return { outcome, refreshCount, sending: phase === 'sending', submit };
}
