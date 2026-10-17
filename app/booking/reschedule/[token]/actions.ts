// app/booking/reschedule/[token]/actions.ts — server action переноса по токену (ТЗ §10.5).
// Тонкая обёртка над lib/booking-action-state (max_reschedules, слот, идемпотентность — там).
// Основная форма переноса вызывает API (нужен список слотов на клиенте); это действие — для формы без JS.
'use server';
import { runReschedule } from '@/lib/booking-action-state';
import type { ActionState } from '@/lib/booking-action-state-types';

export async function rescheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runReschedule(String(formData.get('token') ?? ''), formData);
}
