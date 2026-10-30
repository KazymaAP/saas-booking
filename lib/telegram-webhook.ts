// lib/telegram-webhook.ts — общий каркас обоих webhook Telegram (ТЗ §18.2).
// Порядок: секрет (403) → разбор update → 200 сразу; в фоне: idempotency по update_id
// (webhook_events) → rate limit 30/мин/чат → журнал входящего → обработчик.
// Любая ошибка обработки → 200 + лог: Telegram не должен ретраить и дублировать ответы.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from './supabase';
import { hitRateLimit } from './rate-limit';
import { errorName, hashChatId, logTelegramError, logTelegramMessage, runInBackground, safeEqual } from './telegram';

export const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
export type WebhookSource = 'tg_business' | 'tg_admin';

/** Лимит сообщений с одного чата (ТЗ: 30 в минуту). */
export const CHAT_RATE_LIMIT = 30;
export const CHAT_RATE_WINDOW_SECONDS = 60;
/** Update Telegram — единицы килобайт; больше — не от Telegram. */
const MAX_BODY_BYTES = 64 * 1024;
/** Не чаще раза в минуту на инстанс пишем в журнал про неверный секрет (защита журнала от флуда). */
const MISMATCH_LOG_INTERVAL_MS = 60_000;
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);
const UNIQUE_VIOLATION = '23505';

// ---------- Разбор update ----------

const ChatSchema = z.object({ id: z.number().int(), type: z.string() });
const MessageSchema = z.object({
  message_id: z.number().int(),
  chat: ChatSchema,
  from: z.object({ id: z.number().int(), is_bot: z.boolean().optional() }).optional(),
  text: z.string().optional(),
});
const MemberSchema = z.object({
  chat: ChatSchema,
  new_chat_member: z.object({ status: z.string() }),
});
const UpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: MessageSchema.optional(),
  my_chat_member: MemberSchema.optional(),
});

export type TelegramUpdate = z.infer<typeof UpdateSchema>;

export interface IncomingMessage {
  updateId: number;
  chatId: number;
  chatType: string;
  messageId: number;
  text: string;
}

export interface MembershipChange {
  updateId: number;
  chatId: number;
  status: string;
}

export function parseUpdate(raw: unknown): TelegramUpdate | null {
  const parsed = UpdateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Сообщение от человека (боты и пустые сообщения отбрасываются). */
export function extractMessage(update: TelegramUpdate): IncomingMessage | null {
  const msg = update.message;
  if (!msg || msg.from?.is_bot) return null;
  return {
    updateId: update.update_id,
    chatId: msg.chat.id,
    chatType: msg.chat.type,
    messageId: msg.message_id,
    text: (msg.text ?? '').trim(),
  };
}

export function extractMembership(update: TelegramUpdate): MembershipChange | null {
  const change = update.my_chat_member;
  if (!change) return null;
  return { updateId: update.update_id, chatId: change.chat.id, status: change.new_chat_member.status };
}

export interface ParsedCommand {
  command: string;
  args: string[];
}

/**
 * «/start@my_bot BIZ-ABC» → { command: 'start', args: ['BIZ-ABC'] }.
 * Команда, адресованная другому боту в группе, — null (не наша).
 */
export function parseCommand(text: string, botName?: string | null): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const [head, ...args] = trimmed.split(/\s+/);
  const [command, mention] = head.slice(1).split('@');
  if (!command) return null;
  if (mention && botName && mention.toLowerCase() !== botName.toLowerCase()) return null;
  return { command: command.toLowerCase(), args };
}

async function readJson(req: Request): Promise<unknown> {
  // Content-Length проверяем до чтения тела: огромный запрос не читается в память целиком.
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  try {
    const body = await req.text();
    // Лимит в байтах, а не в символах UTF-16: кириллица — 2 байта на символ.
    if (!body || Buffer.byteLength(body) > MAX_BODY_BYTES) return null;
    const json: unknown = JSON.parse(body);
    return json;
  } catch {
    // Невалидный JSON — не от Telegram; отвечаем 200 и ничего не делаем.
    return null;
  }
}

// ---------- Idempotency ----------

let eventsTableMissing = false;

/** Ключ события: update_id уникален только в пределах бота, поэтому с префиксом источника. */
export function eventKey(source: WebhookSource, updateId: number): string {
  return `${source}:${updateId}`;
}

/**
 * true — update новый и «захвачен» этим вызовом; false — уже обрабатывался.
 * Основной путь — уникальный webhook_events.event_id (ТЗ §4.33). Пока таблицы нет —
 * уникальный rate_limits.bucket. Если недоступно и это — обрабатываем (fail-open):
 * /start защищён атомарным захватом кода, админ-команды только читают.
 */
export async function claimUpdate(source: WebhookSource, updateId: number, kind: string): Promise<boolean> {
  const key = eventKey(source, updateId);
  const db = adminClient();
  if (!eventsTableMissing) {
    const { error } = await db.from('webhook_events').insert({ source, event_id: key, payload: { update_id: updateId, kind } });
    if (!error) return true;
    if (error.code === UNIQUE_VIOLATION) return false;
    if (error.code && MISSING_TABLE_CODES.has(error.code)) eventsTableMissing = true;
    else await logTelegramError('idempotency_insert_failed', { source, db_code: error.code ?? null });
  }
  const { error: fallbackError } = await db.from('rate_limits').insert({ bucket: `tgu:${key}`, window_start: new Date().toISOString(), hits: 1 });
  if (!fallbackError) return true;
  if (fallbackError.code === UNIQUE_VIOLATION) return false;
  await logTelegramError('idempotency_unavailable', { source, db_code: fallbackError.code ?? null });
  return true;
}

export async function markProcessed(source: WebhookSource, updateId: number): Promise<void> {
  if (eventsTableMissing) return;
  const { error } = await adminClient()
    .from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventKey(source, updateId));
  if (error) await logTelegramError('idempotency_mark_failed', { source, db_code: error.code ?? null });
}

// ---------- Rate limit ----------

/** 30 сообщений в минуту с одного чата. Ключ — хэш chat_id. Сбой хранилища — пропускаем (fail-open). */
export async function allowChat(source: WebhookSource, chatId: number): Promise<boolean> {
  try {
    return await hitRateLimit(`tg:${source}:${hashChatId(chatId)}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_SECONDS);
  } catch (error: unknown) {
    await logTelegramError('rate_limit_unavailable', { source, reason: errorName(error) });
    return true;
  }
}

// ---------- Каркас webhook ----------

export interface WebhookHandlers {
  source: WebhookSource;
  secret: string | null;
  onMessage: (msg: IncomingMessage) => Promise<void>;
  onMembership?: (change: MembershipChange) => Promise<void>;
  /** Фильтр до любых записей в БД: чужие чаты админ-бота не тратят idempotency и лимиты. */
  acceptChat?: (chatId: number) => boolean;
}

const lastMismatchLog = new Map<WebhookSource, number>();

async function logSecretMismatch(source: WebhookSource, configured: boolean): Promise<void> {
  const now = Date.now();
  if (now - (lastMismatchLog.get(source) ?? 0) < MISMATCH_LOG_INTERVAL_MS) return;
  lastMismatchLog.set(source, now);
  await logTelegramError(configured ? 'webhook_secret_mismatch' : 'webhook_secret_not_configured', { source });
}

function ok(): Response {
  return NextResponse.json({ ok: true });
}

/** Метка входящего для журнала: только команда, без аргументов и свободного текста (минимум ПД). */
export function incomingLabel(text: string): string {
  const command = parseCommand(text);
  return command ? `/${command.command}` : '(text)';
}

async function processUpdate(update: TelegramUpdate, handlers: WebhookHandlers): Promise<void> {
  const msg = extractMessage(update);
  const membership = extractMembership(update);
  if (!msg && !membership) return;
  const chatId = msg?.chatId ?? membership?.chatId;
  if (handlers.acceptChat && chatId !== undefined && !handlers.acceptChat(chatId)) return;
  const fresh = await claimUpdate(handlers.source, update.update_id, msg ? 'message' : 'membership');
  if (!fresh) return;
  if (membership && handlers.onMembership) await handlers.onMembership(membership);
  if (msg && (await allowChat(handlers.source, msg.chatId))) {
    await logTelegramMessage({
      direction: 'in',
      chatId: msg.chatId,
      messageId: msg.messageId,
      text: incomingLabel(msg.text),
      payload: { source: handlers.source, update_id: msg.updateId },
    });
    await handlers.onMessage(msg);
  }
  await markProcessed(handlers.source, update.update_id);
}

/**
 * Обработчик POST webhook. Секрет сверяется за постоянное время; при несовпадении — 403.
 * Обработка уходит в фон (waitUntil), если платформа поддерживает, иначе выполняется до ответа.
 */
export async function handleTelegramWebhook(req: Request, handlers: WebhookHandlers): Promise<Response> {
  if (!safeEqual(req.headers.get(SECRET_HEADER), handlers.secret)) {
    await logSecretMismatch(handlers.source, Boolean(handlers.secret));
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const update = parseUpdate(await readJson(req));
  if (!update) return ok();
  await runInBackground(() => processUpdate(update, handlers).catch(async (error: unknown) => {
    // Update уже захвачен: Telegram его не повторит, processed_at останется пустым — видно в webhook_events.
    await logTelegramError('update_handler_failed', { source: handlers.source, reason: errorName(error) });
  }));
  return ok();
}

/** Секрет бота (один бот, одна роль webhook): имя из .env.example, фолбэк — имя из ТЗ §18.1. */
export function businessWebhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_BIZ_SECRET || null;
}

/** Сброс внутренних флагов — для тестов. */
export function resetWebhookState(): void {
  eventsTableMissing = false;
  lastMismatchLog.clear();
}
