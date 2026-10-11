// lib/admin-notify.ts — уведомления владельцу сервиса в Telegram (ТЗ §21). Бот один, чат — TELEGRAM_CHAT_ID.
export async function notifyAdmin(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text }),
  }).catch(() => null);
  return Boolean(res?.ok);
}
