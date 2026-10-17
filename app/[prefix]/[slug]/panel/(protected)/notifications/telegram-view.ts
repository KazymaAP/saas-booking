// notifications/telegram-view.ts — общие типы и тексты страницы «Уведомления» (без серверных импортов).
// Импортируется и сервером (actions, page), и клиентом (TelegramConnect.tsx).

export interface TelegramState {
  connected: boolean;
  connectedAt: string | null;
  /** Действующий код подключения (не использован, не истёк). */
  code: string | null;
  expiresAt: string | null;
}

export type ActionErrorCode = 'unauthorized' | 'already_connected' | 'rate_limited' | 'failed';

export type ActionResult =
  | { ok: true; state: TelegramState }
  | { ok: false; error: ActionErrorCode; state: TelegramState | null };

export const DISCONNECTED_STATE: TelegramState = { connected: false, connectedAt: null, code: null, expiresAt: null };

/** Тексты ошибок для пользователя. */
export const ACTION_ERRORS: Record<ActionErrorCode, string> = {
  unauthorized: 'Сессия истекла. Войдите в кабинет заново.',
  already_connected: 'Telegram уже подключён.',
  rate_limited: 'Слишком много кодов подряд. Попробуйте через 10 минут.',
  failed: 'Не получилось выполнить действие. Попробуйте ещё раз.',
};

/** Deep-link: https://t.me/<bot>?start=<code> — бот получит «/start <code>» по нажатию «Start». */
export function deepLink(botName: string | null, code: string | null): string | null {
  if (!botName || !code) return null;
  return `https://t.me/${encodeURIComponent(botName)}?start=${encodeURIComponent(code)}`;
}

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;

/** «14:59» — остаток до истечения кода. */
export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / MS_PER_SECOND));
  const minutes = Math.floor(total / SECONDS_PER_MINUTE);
  const seconds = String(total % SECONDS_PER_MINUTE).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
