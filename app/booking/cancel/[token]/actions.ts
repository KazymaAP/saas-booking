// app/booking/cancel/[token]/actions.ts — server action отмены по токену (ТЗ §10.4).
// Тонкая обёртка: вся логика (идемпотентность, cancel_hours_before, rate limit) — в lib/booking-action-state.
'use server';
import { runCancel } from '@/lib/booking-action-state';
import type { ActionState } from '@/lib/booking-action-state-types';

// Сигнатура под useFormState: (prevState, formData). Токен — скрытое поле формы.
export async function cancelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runCancel(String(formData.get('token') ?? ''));
}
