// lib/booking-action-state-types.ts — типы состояния server actions отмены/переноса.
// Отдельно от lib/booking-action-state.ts: тот импортирует next/headers и БД, а эти типы нужны клиентским формам.
import type { ApiReason } from './schemas';

// Состояние формы для useFormState: idle → done | error. message — готовый текст для aria-live.
export type ActionState =
  | { kind: 'idle' }
  | { kind: 'done'; already: boolean; startsAt?: string }
  | { kind: 'error'; reason: ApiReason; message: string; phone?: string | null };

export const IDLE_STATE: ActionState = { kind: 'idle' };
