// lib/telegram.ts — единая точка отправки в Telegram Bot API (ТЗ §18).
// Один бот, две роли: admin (уведомления владельцу сервиса) и business (уведомления бизнесам).
// Если задан только TELEGRAM_BOT_TOKEN — обе роли обслуживает один бот; если задан ещё и
// TELEGRAM_BUSINESS_BOT_TOKEN — бизнес-роль идёт через него (обратная совместимость с ТЗ §18.1).
// Гарантии: timeout 5 с, 2 повтора (3 попытки), журнал в telegram_messages, алерт админу
// после трёх неудач, кэш getMe на 1 час, глобальный лимит ~25 сообщений/с на инстанс.
import { createHash, createHmac } from 'crypto';
import { adminClient } from '@/lib/supabase';
import { clampText, escapeHtml, stripHtml, TELEGRAM_TEXT_LIMIT } from './telegram-format';

export type TelegramRole = 'admin' | 'business';

export interface InlineButton {
  text: string;
  url: string;
}

export interface SendOptions {
  role?: TelegramRole;
  /** HTML по умолчанию; null — простой текст. */
  parseMode?: 'HTML' | null;
  businessId?: string | null;
  disablePreview?: boolean;
  buttons?: InlineButton[][];
  timeoutMs?: number;
  retries?: number;
  /** Базовая задержка между повторами, мс (экспонента ×3). */
  backoffMs?: number;
  /** Алерт админу после исчерпания повторов (по умолчанию да для business). */
  alertOnFailure?: boolean;
  /** Писать ли в telegram_messages (по умолчанию да). */
  log?: boolean;
}

export interface SendResult {
  ok: boolean;
  messageId: number | null;
  attempts: number;
  /** Короткий код ошибки без PII: no_token, http_403, timeout, network, ... */
  error: string | null;
  /** Группа стала супергруппой: новый chat_id, по которому сообщение и ушло. Его надо сохранить. */
  migratedTo?: string;
}

export interface BotInfo {
  id: number;
  username: string;
  firstName: string;
}

const API_BASE = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 300;
const BACKOFF_FACTOR = 3;
/** Telegram позволяет retry_after до десятков секунд; ждать дольше в serverless нельзя. */
const MAX_RETRY_AFTER_MS = 3_000;
const BOT_INFO_TTL_MS = 60 * 60 * 1000;
const BOT_INFO_FAILURE_TTL_MS = 60 * 1000;
/** Лимит Telegram — 30 сообщений/с на бота; держим запас. */
const GLOBAL_RATE_PER_SECOND = 25;
const RATE_WINDOW_MS = 1_000;
const MESSAGE_LOG_TEXT_LIMIT = 1_000;
/** Исправлений запроса за одну отправку: простой текст + миграция группы. */
const MAX_CORRECTIONS = 2;
/** Коды «таблицы нет» у Postgres и PostgREST: журнал отключается до перезапуска инстанса. */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

// ---------- Токены и окружение ----------

export function botToken(role: TelegramRole): string | null {
  const shared = process.env.TELEGRAM_BOT_TOKEN || null;
  if (role === 'admin') return shared;
  return process.env.TELEGRAM_BUSINESS_BOT_TOKEN || shared;
}

export function adminChatId(): string | null {
  return process.env.TELEGRAM_CHAT_ID || null;
}

export function isAdminChat(chatId: string | number): boolean {
  const admin = adminChatId();
  return admin !== null && String(chatId) === admin;
}

// ---------- Утилиты ----------

export { clampText, escapeHtml, safeEqual, stripHtml, TELEGRAM_TEXT_LIMIT } from './telegram-format';

/**
 * Хэш chat_id для ключей лимитов и логов: chat_id — PII, в открытом виде не храним.
 * HMAC, а не голый sha256: chat_id — число до ~10^10, несолёный хэш перебирается за минуты.
 * Ключ — TELEGRAM_HASH_SECRET, иначе токен бота (секрет сервера); смена ключа лишь сбрасывает лимиты.
 */
export function hashChatId(chatId: string | number): string {
  const key = process.env.TELEGRAM_HASH_SECRET || botToken('admin') || botToken('business') || 'telegram';
  return createHmac('sha256', key).update(String(chatId)).digest('hex').slice(0, 16);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Фоновое выполнение ----------

interface WaitUntilContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}
interface RequestContextHolder {
  get?: () => WaitUntilContext | undefined;
}

/**
 * Выполняет задачу после ответа, если платформа это поддерживает (Vercel request context),
 * иначе дожидается её. Ошибки не теряются: пишутся в audit_log.
 */
export async function runInBackground(task: () => Promise<unknown>): Promise<void> {
  const guarded = task().catch((error: unknown) => logTelegramError('background_failed', { reason: errorName(error) }));
  const holder: RequestContextHolder | undefined = Reflect.get(globalThis, Symbol.for('@vercel/request-context'));
  const waitUntil = holder?.get?.()?.waitUntil;
  if (typeof waitUntil === 'function') {
    waitUntil(guarded);
    return;
  }
  await guarded;
}

export function errorName(error: unknown): string {
  if (error instanceof Error) return error.name === 'AbortError' || error.name === 'TimeoutError' ? 'timeout' : error.name;
  return 'unknown';
}

// ---------- Журналы ----------

/** Ошибка интеграции в audit_log (видна в /panel/logs). Без chat_id и текстов сообщений. */
export async function logTelegramError(code: string, details: Record<string, string | number | boolean | null> = {}): Promise<void> {
  try {
    const { error } = await adminClient().from('audit_log').insert({
      user_id: null,
      action: 'error:telegram',
      entity: 'telegram',
      entity_id: null,
      payload: { message: code, ...details },
    });
    if (error) process.stderr.write(`[telegram] audit_log insert failed: ${error.code ?? 'unknown'}\n`);
  } catch (error: unknown) {
    // Журнал ошибок недоступен — остаётся только stderr платформы.
    process.stderr.write(`[telegram] audit_log unavailable: ${errorName(error)} (${code})\n`);
  }
}

let messagesTableMissing = false;

export interface MessageLogEntry {
  direction: 'in' | 'out';
  chatId: string | number | null;
  businessId?: string | null;
  messageId?: number | null;
  text?: string | null;
  payload?: Record<string, string | number | boolean | null>;
}

/** Запись в telegram_messages (ТЗ §4.31). Таблица только для super_admin по RLS. */
export async function logTelegramMessage(entry: MessageLogEntry): Promise<void> {
  if (messagesTableMissing) return;
  try {
    await insertMessage(entry);
  } catch (error: unknown) {
    // Журнал не должен ломать отправку: sendTelegram обещает не бросать исключений.
    await logTelegramError('messages_log_crashed', { reason: errorName(error) });
  }
}

async function insertMessage(entry: MessageLogEntry): Promise<void> {
  const { error } = await adminClient().from('telegram_messages').insert({
    direction: entry.direction,
    chat_id: entry.chatId === null ? null : String(entry.chatId),
    business_id: entry.businessId ?? null,
    message_id: entry.messageId === null || entry.messageId === undefined ? null : String(entry.messageId),
    text: entry.text ? entry.text.slice(0, MESSAGE_LOG_TEXT_LIMIT) : null,
    payload: entry.payload ?? {},
  });
  if (!error) return;
  if (error.code && MISSING_TABLE_CODES.has(error.code)) {
    messagesTableMissing = true;
    await logTelegramError('messages_table_missing');
    return;
  }
  await logTelegramError('messages_log_failed', { db_code: error.code ?? null });
}

// ---------- Глобальный лимит отправки ----------

const sentAt: number[] = [];

/**
 * Скользящее окно 1 с на инстанс: в циклах cron не упираемся в 429 от Telegram.
 * После сна окно проверяется заново: параллельные отправки (Promise.all) просыпаются вместе,
 * и без повторной проверки все сразу заняли бы слоты сверх лимита.
 */
async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (sentAt.length && now - sentAt[0] >= RATE_WINDOW_MS) sentAt.shift();
    if (sentAt.length < GLOBAL_RATE_PER_SECOND) {
      sentAt.push(now);
      return;
    }
    await sleep(RATE_WINDOW_MS - (now - sentAt[0]));
  }
}

// ---------- Вызов API ----------

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id?: number; id?: number; username?: string; first_name?: string };
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

interface AttemptResult {
  ok: boolean;
  status: number;
  body: TelegramApiResponse | null;
  error: string | null;
}

/** Один HTTP-вызов метода Bot API с таймаутом. Не бросает исключений. */
export async function callTelegram(token: string, method: string, payload: Record<string, unknown>, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await parseApiBody(res);
    const ok = res.ok && body?.ok === true;
    return { ok, status: res.status, body, error: ok ? null : `http_${res.status}` };
  } catch (error: unknown) {
    const name = errorName(error);
    return { ok: false, status: 0, body: null, error: name === 'timeout' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

async function parseApiBody(res: Response): Promise<TelegramApiResponse | null> {
  try {
    const json: TelegramApiResponse = await res.json();
    return json;
  } catch {
    // Тело не JSON (например, HTML-страница балансировщика) — решение принимается по HTTP-статусу.
    return null;
  }
}

/** Повторять имеет смысл только сетевые сбои, таймауты, 429 и 5xx. 400/403 — окончательные. */
function isRetryable(attempt: AttemptResult): boolean {
  return attempt.status === 0 || attempt.status === 429 || attempt.status >= 500;
}

function isParseError(attempt: AttemptResult): boolean {
  return attempt.status === 400 && /parse entities/i.test(attempt.body?.description ?? '');
}

function retryDelay(attempt: AttemptResult, index: number, backoffMs: number): number {
  const retryAfter = attempt.body?.parameters?.retry_after;
  if (attempt.status === 429 && typeof retryAfter === 'number') return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  return backoffMs * BACKOFF_FACTOR ** index;
}

function buildPayload(chatId: string | number, text: string, options: SendOptions): Record<string, unknown> {
  const requested = options.parseMode === undefined ? 'HTML' : options.parseMode;
  // Обрезанный HTML почти всегда невалиден (разрезан тег или &amp;) → 400 и лишний запрос.
  // Длинный HTML сразу уходит простым текстом.
  const tooLongHtml = requested === 'HTML' && text.length > TELEGRAM_TEXT_LIMIT;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: clampText(tooLongHtml ? stripHtml(text) : text),
    disable_web_page_preview: options.disablePreview ?? true,
  };
  const parseMode = tooLongHtml ? null : requested;
  if (parseMode) payload.parse_mode = parseMode;
  if (options.buttons?.length) payload.reply_markup = { inline_keyboard: options.buttons };
  return payload;
}

/**
 * Исправленный запрос вместо повтора: HTML не разобран → простой текст; группа мигрировала →
 * новый chat_id. Каждое исправление — один раз, попытку не расходует (иначе при retries: 0 текст
 * не ушёл бы вовсе). null — исправлять нечего.
 */
function correctPayload(last: AttemptResult, payload: Record<string, unknown>, text: string, options: SendOptions): Record<string, unknown> | null {
  if (isParseError(last) && payload.parse_mode) {
    return buildPayload(String(payload.chat_id), stripHtml(text), { ...options, parseMode: null });
  }
  const migrated = last.body?.parameters?.migrate_to_chat_id;
  if (last.status === 400 && typeof migrated === 'number' && String(migrated) !== String(payload.chat_id)) {
    return { ...payload, chat_id: migrated };
  }
  return null;
}

/** Отправка с повторами (только сетевые сбои, 429, 5xx) и исправлением запроса (correctPayload). */
async function deliver(token: string, chatId: string | number, text: string, options: SendOptions): Promise<{ result: SendResult; status: number }> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  let payload = buildPayload(chatId, text, options);
  let last: AttemptResult = { ok: false, status: 0, body: null, error: 'not_sent' };
  let attempts = 0;
  let corrections = 0;
  for (let index = 0; index <= retries; index++) {
    await throttle();
    attempts++;
    last = await callTelegram(token, 'sendMessage', payload, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (last.ok) break;
    const corrected = corrections < MAX_CORRECTIONS ? correctPayload(last, payload, text, options) : null;
    if (corrected) {
      payload = corrected;
      corrections++;
      index--;
      continue;
    }
    if (!isRetryable(last) || index === retries) break;
    await sleep(retryDelay(last, index, backoffMs));
  }
  const messageId = last.body?.result?.message_id ?? null;
  const finalChat = String(payload.chat_id);
  const migratedTo = last.ok && finalChat !== String(chatId) ? finalChat : undefined;
  return { result: { ok: last.ok, messageId, attempts, error: last.error, migratedTo }, status: last.status };
}

/**
 * Единая точка отправки сообщения. Никогда не бросает исключений — результат в SendResult.
 * После исчерпания повторов пишет ошибку в audit_log и (для роли business) алертит админа.
 */
export async function sendTelegram(chatId: string | number | null | undefined, text: string, options: SendOptions = {}): Promise<SendResult> {
  const role = options.role ?? 'business';
  const token = botToken(role);
  if (!token) return { ok: false, messageId: null, attempts: 0, error: 'no_token' };
  if (chatId === null || chatId === undefined || String(chatId).trim() === '') {
    return { ok: false, messageId: null, attempts: 0, error: 'no_chat' };
  }
  const { result, status } = await deliver(token, chatId, text, options);
  if (options.log !== false) {
    await logTelegramMessage({
      direction: 'out',
      chatId: result.migratedTo ?? chatId,
      businessId: options.businessId ?? null,
      messageId: result.messageId,
      text,
      payload: { role, ok: result.ok, attempts: result.attempts, error: result.error },
    });
  }
  if (!result.ok) await reportFailure(role, result, status, options);
  return result;
}

/** Алерт админу о недоставке — не чаще раза в 10 минут на инстанс; пропущенные считаются. */
const FAILURE_ALERT_INTERVAL_MS = 10 * 60 * 1000;
let lastFailureAlertAt = 0;
let suppressedFailures = 0;

async function reportFailure(role: TelegramRole, result: SendResult, status: number, options: SendOptions): Promise<void> {
  await logTelegramError('send_failed', { role, status, attempts: result.attempts, error: result.error });
  // 403 — пользователь заблокировал бота: это не авария, админа не будим.
  const alert = options.alertOnFailure ?? role === 'business';
  if (!alert || status === 403 || role === 'admin') return;
  const chat = adminChatId();
  if (!chat) return;
  // Telegram лёг — cron по сотне бизнесов не должен превращаться в сотню алертов (каждый в audit_log есть).
  const now = Date.now();
  if (now - lastFailureAlertAt < FAILURE_ALERT_INTERVAL_MS) {
    suppressedFailures++;
    return;
  }
  const extra = suppressedFailures > 0 ? `, ещё ${suppressedFailures} с прошлого алерта` : '';
  lastFailureAlertAt = now;
  suppressedFailures = 0;
  await sendTelegram(chat, `❌ <b>Telegram</b>: не доставлено уведомление бизнесу (${escapeHtml(result.error)}, попыток: ${result.attempts}${extra})`, {
    role: 'admin',
    alertOnFailure: false,
  });
}

// ---------- getMe с кэшем ----------

const botInfoCache = new Map<string, { info: BotInfo | null; expiresAt: number }>();

/**
 * Информация о боте (username для deep-link). Кэш 1 час на токен.
 * Ошибка кэшируется на 1 минуту: иначе при недоступном Telegram каждый рендер страницы
 * «Уведомления» и каждый update ждали бы getMe до таймаута 5 с.
 */
export async function getBotInfo(role: TelegramRole = 'business'): Promise<BotInfo | null> {
  const token = botToken(role);
  if (!token) return null;
  const key = createHash('sha256').update(token).digest('hex');
  const cached = botInfoCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.info;
  const res = await callTelegram(token, 'getMe', {});
  const result = res.body?.result;
  if (!res.ok || !result?.username || typeof result.id !== 'number') {
    botInfoCache.set(key, { info: null, expiresAt: Date.now() + BOT_INFO_FAILURE_TTL_MS });
    await logTelegramError('get_me_failed', { role, status: res.status, error: res.error });
    return null;
  }
  const info: BotInfo = { id: result.id, username: result.username, firstName: result.first_name ?? '' };
  botInfoCache.set(key, { info, expiresAt: Date.now() + BOT_INFO_TTL_MS });
  return info;
}

/** Имя бота для ссылок: из env (без запроса) или getMe. */
export async function botUsername(role: TelegramRole = 'business'): Promise<string | null> {
  const fromEnv = role === 'business' ? process.env.TELEGRAM_BUSINESS_BOT_USERNAME : process.env.TELEGRAM_BOT_USERNAME;
  if (fromEnv) return fromEnv.replace(/^@/, '');
  const info = await getBotInfo(role);
  return info?.username ?? null;
}

/** Сброс внутренних кэшей — для тестов и после смены токена. */
export function resetTelegramState(): void {
  botInfoCache.clear();
  sentAt.length = 0;
  messagesTableMissing = false;
  lastFailureAlertAt = 0;
  suppressedFailures = 0;
}
