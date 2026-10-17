// lib/booking-action-state.ts — ядро server actions отмены/переноса (только сервер, без 'use server').
// Файлы actions.ts — тонкие 'use server'-обёртки над этими функциями, чтобы не дублировать логику.
// Защита: CSRF у server actions встроен в Next 14 (Origin ↔ Host), rate limit — тот же, что у API.
import { headers } from 'next/headers';
import { cancelBooking, rescheduleBooking } from './booking-actions';
import { clientIp, rateLimitScope } from './rate-limit';
import { cancelInput, REASON_MESSAGES, rescheduleInput, type ApiReason } from './schemas';
import type { ActionState } from './booking-action-state-types';
import { logError } from './log';

// Телефон в состояние кладётся отдельно (форма показывает его ссылкой tel:), поэтому в тексте его нет —
// иначе номер выводился бы дважды.
function errorState(reason: ApiReason, phone?: string | null): ActionState {
  return { kind: 'error', reason, message: REASON_MESSAGES[reason], phone };
}

async function limited(scope: 'cancel' | 'reschedule'): Promise<ActionState | null> {
  const result = await rateLimitScope(scope, clientIp(headers()));
  return result.allowed ? null : errorState('rate_limited');
}

export async function runCancel(rawToken: string): Promise<ActionState> {
  const token = cancelInput.safeParse({ token: rawToken });
  if (token.success === false) return errorState('not_found');
  const blocked = await limited('cancel');
  if (blocked !== null) return blocked;
  try {
    const result = await cancelBooking(token.data.token);
    if (result.ok) return { kind: 'done', already: result.value.already === true };
    return errorState(result.failure.reason, result.failure.phone);
  } catch (error) {
    await logError('booking', 'cancel_action_failed', { error: error instanceof Error ? error.message : String(error) });
    return errorState('server');
  }
}

export async function runReschedule(rawToken: string, formData: FormData): Promise<ActionState> {
  const token = cancelInput.safeParse({ token: rawToken });
  if (token.success === false) return errorState('not_found');
  const input = rescheduleInput.safeParse({ date: formData.get('date'), startsAt: formData.get('startsAt') });
  if (input.success === false) return errorState('validation');
  const blocked = await limited('reschedule');
  if (blocked !== null) return blocked;
  try {
    const result = await rescheduleBooking(token.data.token, input.data);
    if (result.ok) return { kind: 'done', already: result.value.already === true, startsAt: result.value.startsAt };
    return errorState(result.failure.reason, result.failure.phone);
  } catch (error) {
    await logError('booking', 'reschedule_action_failed', { error: error instanceof Error ? error.message : String(error) });
    return errorState('server');
  }
}
