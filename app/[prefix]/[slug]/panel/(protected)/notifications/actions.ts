// app/[prefix]/[slug]/panel/(protected)/notifications/actions.ts — подключение Telegram (ТЗ §18.3, §36).
// Server actions возвращают свежий TelegramState: клиент применяет его поверх optimistic-состояния.
// Права проверяются в каждом action заново (cookie может истечь между рендером и кликом).
'use server';
import { revalidatePath } from 'next/cache';
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';
import { hitRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { issueCode } from '@/lib/telegram-connect';
import { logTelegramError } from '@/lib/telegram';
import { loadTelegramState } from './telegram-state';
import { DISCONNECTED_STATE, type ActionResult } from './telegram-view';

/** Не больше 5 кодов за 10 минут на бизнес: защита от перебора/спама кнопкой. */
const CODE_RATE_LIMIT = 5;
const CODE_RATE_WINDOW_SECONDS = 600;

function panelPath(prefix: string, slug: string): string {
  return `/${prefix}/${slug}/panel/notifications`;
}

/** Новый одноразовый код BIZ-xxxxxx (TTL 15 мин). Прежние неиспользованные коды гасятся. */
export async function createTelegramCode(prefix: string, slug: string): Promise<ActionResult> {
  const access = await currentOwner(slug);
  if (!access) return { ok: false, error: 'unauthorized', state: null };
  const businessId = access.business.id;
  const current = await loadTelegramState(businessId);
  if (current?.connected) return { ok: false, error: 'already_connected', state: current };
  const allowed = await hitRateLimit(`tg_code:${businessId}`, CODE_RATE_LIMIT, CODE_RATE_WINDOW_SECONDS);
  if (!allowed) return { ok: false, error: 'rate_limited', state: current };
  const issued = await issueCode(businessId);
  if (!issued) return { ok: false, error: 'failed', state: current };
  revalidatePath(panelPath(prefix, slug));
  return {
    ok: true,
    state: { connected: false, connectedAt: null, code: issued.code, expiresAt: issued.expiresAt },
  };
}

/** Отвязка чата. Неиспользованные коды тоже удаляются — старым кодом не переподключиться. */
export async function disconnectTelegram(prefix: string, slug: string): Promise<ActionResult> {
  const access = await currentOwner(slug);
  if (!access) return { ok: false, error: 'unauthorized', state: null };
  const businessId = access.business.id;
  const db = adminClient();
  const { error } = await db
    .from('businesses').update({ telegram_chat_id: null, telegram_connected_at: null }).eq('id', businessId);
  if (error) {
    await logTelegramError('disconnect_failed', { db_code: error.code ?? null });
    return { ok: false, error: 'failed', state: await loadTelegramState(businessId) };
  }
  const { error: codesError } = await db.from('business_telegram_codes').delete().eq('business_id', businessId).is('used_at', null);
  if (codesError) await logTelegramError('code_cleanup_failed', { db_code: codesError.code ?? null });
  await audit('telegram_disconnected', 'business', businessId, { by: access.member.role });
  revalidatePath(panelPath(prefix, slug));
  return { ok: true, state: DISCONNECTED_STATE };
}

/** Проверка статуса: страница опрашивает, пока показан код, и сама переключается на «подключено». */
export async function checkTelegramStatus(prefix: string, slug: string): Promise<ActionResult> {
  const access = await currentOwner(slug);
  if (!access) return { ok: false, error: 'unauthorized', state: null };
  const state = await loadTelegramState(access.business.id);
  if (!state) return { ok: false, error: 'failed', state: null };
  if (state.connected) revalidatePath(panelPath(prefix, slug));
  return { ok: true, state };
}
