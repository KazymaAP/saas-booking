// app/api/telegram/admin-webhook/route.ts — webhook бота владельца сервиса (ТЗ §18.1, §18.2, §18.4).
// Секрет X-Telegram-Bot-Api-Secret-Token → 403; idempotency по update_id; rate limit 30/мин/чат;
// всегда 200 после проверки секрета. Отвечает только чату TELEGRAM_CHAT_ID, чужие игнорируются молча.
// Команды: /stats — сводка, /health — БД и Bot API, /ping, /help; прочее — «Неизвестная команда».
import { botUsername, isAdminChat, sendTelegram } from '@/lib/telegram';
import { adminWebhookSecret, handleTelegramWebhook, parseCommand, type IncomingMessage } from '@/lib/telegram-webhook';
import { ADMIN_COMMANDS, ADMIN_UNKNOWN_COMMAND, runAdminCommand } from '@/lib/telegram-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function onMessage(msg: IncomingMessage): Promise<void> {
  // Повторная проверка (первая — acceptChat): чужим чатам не отвечаем ни при каких условиях.
  if (!isAdminChat(msg.chatId)) return;
  const parsed = parseCommand(msg.text, await botUsername('admin'));
  if (parsed && ADMIN_COMMANDS.has(parsed.command)) {
    await runAdminCommand(parsed.command, msg.chatId, 'admin');
    return;
  }
  await sendTelegram(msg.chatId, ADMIN_UNKNOWN_COMMAND, { role: 'admin', alertOnFailure: false });
}

export async function POST(req: Request): Promise<Response> {
  return handleTelegramWebhook(req, { source: 'tg_admin', secret: adminWebhookSecret(), onMessage, acceptChat: isAdminChat });
}
