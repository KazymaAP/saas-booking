// lib/admin-notify.ts — уведомления владельцу сервиса в Telegram (ТЗ §18.4, §21).
// Роль admin единой точки отправки lib/telegram.ts: чат TELEGRAM_CHAT_ID, токен TELEGRAM_BOT_TOKEN.
// Сигнатура notifyAdmin(text): Promise<boolean> сохранена — её вызывают брони, оплаты, cron, удаление.
// Единый формат: HTML-сообщения строятся в lib/telegram-events.ts (эмодзи + жирный заголовок),
// простой текст экранируется здесь.
import { escapeHtml, logTelegramError, sendTelegram } from './telegram';

/**
 * Простой текст владельцу. Текст экранируется, поэтому «<» в имени бизнеса ничего не ломает.
 * Никогда не бросает исключений: ошибка — false и запись error:telegram в audit_log.
 */
export async function notifyAdmin(text: string): Promise<boolean> {
  return notifyAdminHtml(escapeHtml(text));
}

/** Готовый HTML (из lib/telegram-events.ts) владельцу. */
export async function notifyAdminHtml(html: string): Promise<boolean> {
  const chat = process.env.TELEGRAM_CHAT_ID;
  // Не настроено (локальная разработка) — молча false, без записи в журнал на каждое событие.
  if (!chat || !process.env.TELEGRAM_BOT_TOKEN) return false;
  try {
    const res = await sendTelegram(chat, html, { role: 'admin', alertOnFailure: false });
    // Ошибка доставки уже записана в audit_log внутри sendTelegram (fallback — лог).
    return res.ok;
  } catch (error: unknown) {
    // sendTelegram не бросает; страховка от сбоя журнала, чтобы бронь/оплата не падали из-за уведомления.
    await logTelegramError('admin_notify_crashed', { reason: error instanceof Error ? error.name : 'unknown' });
    return false;
  }
}
