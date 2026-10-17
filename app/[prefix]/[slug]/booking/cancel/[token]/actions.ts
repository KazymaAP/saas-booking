// app/[prefix]/[slug]/booking/cancel/[token]/actions.ts — server action отмены на сайте бизнеса (ТЗ §10.4).
// Было: отдельная копия логики с безусловным UPDATE (двойное нажатие → два уведомления) и redirect ?late=1,
// который страница не читала. Теперь — та же реализация, что у API (lib/booking-action-state).
'use server';
import { runCancel } from '@/lib/booking-action-state';
import type { ActionState } from '@/lib/booking-action-state-types';

export async function cancelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runCancel(String(formData.get('token') ?? ''));
}
