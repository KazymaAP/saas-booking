// notifications/telegram-state.ts — загрузка состояния подключения Telegram из БД (только сервер).
import { adminClient } from '@/lib/supabase';
import { activeCode } from '@/lib/telegram-connect';
import { logTelegramError } from '@/lib/telegram';
import type { TelegramState } from './telegram-view';

/** Свежий статус: привязан ли чат и есть ли действующий код. null — БД недоступна. */
export async function loadTelegramState(businessId: string): Promise<TelegramState | null> {
  const { data, error } = await adminClient()
    .from('businesses').select('telegram_chat_id, telegram_connected_at').eq('id', businessId).maybeSingle();
  if (error || !data) {
    await logTelegramError('state_load_failed', { db_code: error?.code ?? null });
    return null;
  }
  const row: { telegram_chat_id: string | null; telegram_connected_at: string | null } = data;
  if (row.telegram_chat_id) {
    return { connected: true, connectedAt: row.telegram_connected_at, code: null, expiresAt: null };
  }
  const pending = await activeCode(businessId);
  return { connected: false, connectedAt: null, code: pending?.code ?? null, expiresAt: pending?.expiresAt ?? null };
}
