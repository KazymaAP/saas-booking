// app/api/telegram/webhook/route.ts — webhook бизнес-бота (ТЗ §18.2, §18.3).
// Секрет X-Telegram-Bot-Api-Secret-Token → 403; idempotency по update_id; rate limit 30/мин/чат;
// всегда 200 после проверки секрета. Команды:
//   /start BIZ-xxxxxx — привязка чата к бизнесу (код одноразовый, TTL 15 мин, ≤10 попыток/10 мин/чат);
//   /start            — подсказка; /help — подсказка;
//   /stop             — отключение уведомлений этого чата;
//   /stats /ping /health из TELEGRAM_CHAT_ID — админ-команды (один бот — две роли);
//   прочее            — «Неизвестная команда».
// Сообщения не из личного чата (группы/каналы) без /start игнорируются — не отвечаем чужим.
import { BOT_REPLIES } from '@/телеграмм-бот/telegram-events';
import { botUsername, isAdminChat, sendTelegram } from '@/телеграмм-бот/telegram';
import { allowCodeAttempt, bindChat, businessByChat, claimCode, normalizeCode, unbindChat, type ClaimResult } from '@/телеграмм-бот/telegram-connect';
import {
  businessWebhookSecret,
  handleTelegramWebhook,
  parseCommand,
  type IncomingMessage,
  type MembershipChange,
} from '@/телеграмм-бот/telegram-webhook';
import { ADMIN_COMMANDS, runAdminCommand } from '@/телеграмм-бот/telegram-admin';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAIM_REPLIES: Record<Exclude<ClaimResult['status'], 'ok'>, string> = {
  not_found: BOT_REPLIES.codeNotFound,
  used: BOT_REPLIES.codeUsed,
  expired: BOT_REPLIES.codeExpired,
  error: BOT_REPLIES.internalError,
};

function reply(chatId: number, text: string, businessId: string | null = null) {
  return sendTelegram(chatId, text, { role: 'business', businessId, alertOnFailure: false });
}

async function handleStart(msg: IncomingMessage, arg: string | undefined): Promise<void> {
  const code = normalizeCode(arg);
  if (!arg) {
    await reply(msg.chatId, BOT_REPLIES.startWithoutCode);
    return;
  }
  if (!code) {
    await reply(msg.chatId, BOT_REPLIES.codeNotFound);
    return;
  }
  // Лимит попыток — до обращения к кодам: защита от перебора с одного чата.
  if (!(await allowCodeAttempt(msg.chatId))) {
    await reply(msg.chatId, BOT_REPLIES.tooManyAttempts);
    return;
  }
  const claim = await claimCode(code);
  if (claim.status !== 'ok') {
    await reply(msg.chatId, CLAIM_REPLIES[claim.status]);
    return;
  }
  const business = await bindChat(claim.businessId, msg.chatId);
  if (!business) {
    await reply(msg.chatId, BOT_REPLIES.internalError);
    return;
  }
  await audit('telegram_connected', 'business', claim.businessId, { chat_type: msg.chatType });
  await reply(msg.chatId, BOT_REPLIES.connected(business.name), claim.businessId);
}

async function handleStop(msg: IncomingMessage): Promise<void> {
  const count = await unbindChat(msg.chatId);
  const text = count > 0
    ? 'Уведомления отключены. Чтобы подключить снова, получите код в кабинете.'
    : 'Этот чат не подключён к уведомлениям.';
  await reply(msg.chatId, text);
}

async function onMessage(msg: IncomingMessage): Promise<void> {
  // Имя бота: env или getMe (кэш 1 ч) — иначе в группе приняли бы «/start@чужой_бот».
  const parsed = parseCommand(msg.text, await botUsername('business'));
  const isPrivate = msg.chatType === 'private';

  // Один бот — две роли: админ-команды только из TELEGRAM_CHAT_ID.
  if (parsed && ADMIN_COMMANDS.has(parsed.command) && isAdminChat(msg.chatId)) {
    await runAdminCommand(parsed.command, msg.chatId, 'business');
    return;
  }
  if (parsed?.command === 'start') {
    await handleStart(msg, parsed.args[0]);
    return;
  }
  // В группах/каналах на прочее молчим: бота могли добавить куда угодно.
  if (!isPrivate) return;
  if (parsed?.command === 'stop') {
    await handleStop(msg);
    return;
  }
  if (parsed?.command === 'help') {
    await reply(msg.chatId, BOT_REPLIES.startWithoutCode);
    return;
  }
  // Голый код без /start — частая ошибка: принимаем.
  const bareCode = !parsed ? normalizeCode(msg.text) : null;
  if (bareCode) {
    await handleStart(msg, bareCode);
    return;
  }
  // Привязанный чат — это переписка с платформой: текст уже записан в журнал и виден в админке
  // («Чат»), поэтому отвечаем не «неизвестная команда», а подтверждением, что сообщение дошло.
  const linked = await businessByChat(msg.chatId);
  if (linked) {
    await reply(msg.chatId, BOT_REPLIES.messageForwarded);
    return;
  }
  await reply(msg.chatId, BOT_REPLIES.unknownCommand);
}

/** Бота заблокировали или удалили из группы — отвязываем чат, чтобы не слать в 403. */
async function onMembership(change: MembershipChange): Promise<void> {
  if (change.status !== 'kicked' && change.status !== 'left') return;
  const count = await unbindChat(change.chatId);
  if (count > 0) await audit('telegram_disconnected', 'telegram', null, { reason: change.status, businesses: count });
}

export async function POST(req: Request): Promise<Response> {
  return handleTelegramWebhook(req, { source: 'tg_business', secret: businessWebhookSecret(), onMessage, onMembership });
}
