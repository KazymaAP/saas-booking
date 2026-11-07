// lib/notify.ts — уведомления: Telegram бизнесу и отправка email через ящики Yandex 360 (ТЗ §9.1, §17.8).
// sendMail — прежний простой API (boolean) для транзакционных писем из других зон.
// sendMailDetailed — подробный результат для очереди email_queue (cron send-emails, inbox).
// Retry: до 3 попыток с экспоненциальной паузой; постоянные ошибки (5xx получателя) не повторяются.
// В логах адреса маскируются (ТЗ §17.8), пароли и тела писем не пишутся.
import { createHash } from 'crypto';
import nodemailer from 'nodemailer';
import { adminClient } from './supabase';
import { logError } from './log';
import {
  fromHeader,
  markFailed,
  markHealthy,
  markSent,
  pickAccount,
  smtpOptions,
  supabaseAccountStore,
  type EmailAccountRecord,
  type EmailAccountStore,
  type SmtpOptions,
} from './email-accounts';

export type BusinessEvent = 'new' | 'cancel' | 'reschedule';

const EVENT_TEXT: Record<BusinessEvent, string> = {
  new: '🎉 Новая запись',
  cancel: '❌ Запись отменена клиентом',
  reschedule: '🔄 Запись перенесена',
};

const TELEGRAM_TIMEOUT_MS = 5_000;
export const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 400;
const HARD_BOUNCE_CODES = new Set([550, 551, 553]);
const AUTH_CODES = new Set([534, 535]);

// ===== PII =====

// ivan.petrov@mail.ru → i***v@m***.ru. Для коротких имён остаётся только первая буква.
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at <= 0) return value ? '***' : '';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : `${local[0]}***`;
  return `${maskedLocal}@${host[0] ?? ''}***${tld}`;
}

// Маскирует email и телефоны в произвольной строке (текст ошибки SMTP может содержать адрес).
export function maskPii(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m))
    .replace(/\+?\d[\d\s()-]{8,}\d/g, (m) => `${m.slice(0, 2)}***${m.slice(-2)}`);
}

export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== Telegram =====

export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  // Один бот: токен бизнес-роли берёт TELEGRAM_BUSINESS_BOT_TOKEN, иначе общий TELEGRAM_BOT_TOKEN.
  const token = process.env.TELEGRAM_BUSINESS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    if (!res.ok) await logError('email', `telegram: HTTP ${res.status}`, { channel: 'telegram' });
    return res.ok;
  } catch (e) {
    await logError('email', `telegram: ${maskPii((e as Error).message)}`, { channel: 'telegram' });
    return false;
  }
}

type BookingForNotify = {
  scheduled_at: string;
  client_name: string | null;
  client_phone: string | null;
  services: { name: string | null } | { name: string | null }[] | null;
};

function serviceName(services: BookingForNotify['services']): string {
  const s = Array.isArray(services) ? services[0] : services;
  return s?.name ?? 'Услуга';
}

// Событие брони бизнесу: Telegram (если подключён) и email владельца.
export async function notifyBusinessEvent(businessId: string, event: BusinessEvent, bookingId: string): Promise<void> {
  const db = adminClient();
  const [{ data: business }, { data: bookingRow }] = await Promise.all([
    db.from('businesses').select('name, telegram_chat_id, emails').eq('id', businessId).maybeSingle(),
    db.from('bookings').select('scheduled_at, client_name, client_phone, services(name)').eq('id', bookingId).maybeSingle(),
  ]);
  if (!business || !bookingRow) return;
  const booking = bookingRow as BookingForNotify;

  const when = new Date(booking.scheduled_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const lines = [business.name, `${serviceName(booking.services)}, ${when}`, `${booking.client_name ?? ''} ${booking.client_phone ?? ''}`.trim()];
  const plain = `${EVENT_TEXT[event]}\n${lines.join('\n')}`;

  if (business.telegram_chat_id) {
    await sendTelegram(business.telegram_chat_id, `${EVENT_TEXT[event]}\n${lines.map(escapeTelegramHtml).join('\n')}`);
  }
  const ownerEmail = Array.isArray(business.emails) ? business.emails[0] : undefined;
  // №26: уведомление владельцу о брони — транзакционное, не расходует лимит рассылки.
  if (ownerEmail) await sendMail({ to: ownerEmail, subject: EVENT_TEXT[event], text: plain, transactional: true });
}

// ===== классификация ошибок SMTP =====

export type SmtpErrorKind = 'hard_bounce' | 'soft' | 'auth' | 'network';
export type SmtpErrorInfo = { kind: SmtpErrorKind; code: number | null; message: string };

type ErrorLike = { message?: unknown; responseCode?: unknown; code?: unknown };

export function classifySmtpError(e: unknown): SmtpErrorInfo {
  const err = (typeof e === 'object' && e !== null ? e : {}) as ErrorLike;
  const message = maskPii(String(err.message ?? e ?? 'unknown error')).slice(0, 300);
  const code = typeof err.responseCode === 'number' ? err.responseCode : null;
  if (err.code === 'EAUTH' || (code !== null && AUTH_CODES.has(code))) return { kind: 'auth', code, message };
  if (code !== null && HARD_BOUNCE_CODES.has(code)) return { kind: 'hard_bounce', code, message };
  if (code !== null && code >= 400) return { kind: 'soft', code, message };
  return { kind: 'network', code, message };
}

// ===== отправка =====

export type MailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  // Отправить строго с этого ящика (ответ из inbox — «из того же ящика»).
  accountId?: string;
  // Ящики, которые нельзя брать (уже отправляли в этом запуске cron).
  excludeAccounts?: ReadonlySet<string>;
  // Epoch ms: после этого момента повторные попытки не начинаются (бюджет cron, Vercel Hobby 10 с).
  // Первая попытка выполняется всегда; недоотправленное письмо уйдёт в retry очереди.
  deadline?: number;
  // №26: транзакционное письмо (уведомление о брони, клиенту, доступ владельцу) не расходует дневной
  // лимит холодной рассылки и не теряется при его исчерпании.
  transactional?: boolean;
};

export type SendResult =
  | { ok: true; accountId: string; fromEmail: string; messageId: string | null; attempts: number }
  | { ok: false; reason: 'no_account' | 'invalid' | SmtpErrorKind; error: string; code: number | null; accountId: string | null; attempts: number };

export type MailTransport = { sendMail(message: Record<string, unknown>): Promise<{ messageId?: string }> };

export type NotifyDeps = {
  store: EmailAccountStore;
  createTransport: (opts: SmtpOptions) => MailTransport;
  sleep: (ms: number) => Promise<void>;
  log: (message: string, payload: Record<string, unknown>) => Promise<unknown>;
  now: () => Date;
};

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value) && value.length <= 254;
}

export function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * 2 ** attempt;
}

function buildMessage(acc: EmailAccountRecord, opts: MailOptions): Record<string, unknown> {
  const message: Record<string, unknown> = {
    from: fromHeader(acc),
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  };
  if (opts.html) message.html = opts.html;
  if (acc.reply_to) message.replyTo = acc.reply_to;
  if (opts.headers) message.headers = opts.headers;
  if (opts.messageId) message.messageId = opts.messageId;
  if (opts.inReplyTo) message.inReplyTo = opts.inReplyTo;
  if (opts.references) message.references = opts.references;
  return message;
}

async function resolveAccount(deps: NotifyDeps, opts: MailOptions, skip: Set<string>): Promise<EmailAccountRecord | null> {
  if (opts.accountId) {
    if (skip.has(opts.accountId)) return null;
    const acc = await deps.store.getById(opts.accountId);
    return acc && acc.active && acc.smtp_pass_encrypted ? acc : null;
  }
  return pickAccount(deps.store, { exclude: skip, now: deps.now(), transactional: opts.transactional });
}

// Одна попытка через конкретный ящик.
async function attemptSend(deps: NotifyDeps, acc: EmailAccountRecord, opts: MailOptions): Promise<{ ok: true; messageId: string | null } | { ok: false; info: SmtpErrorInfo }> {
  try {
    const info = await deps.createTransport(smtpOptions(acc)).sendMail(buildMessage(acc, opts));
    return { ok: true, messageId: info.messageId ?? opts.messageId ?? null };
  } catch (e) {
    return { ok: false, info: classifySmtpError(e) };
  }
}

// Письмо уже принято SMTP-сервером. Сбой учёта (sent_today, last_error) логируется, но не превращает
// успех в ошибку: иначе вызывающий код (очередь) повторил бы отправку и получатель получил бы дубль.
async function recordAccountSuccess(deps: NotifyDeps, acc: EmailAccountRecord, transactional = false): Promise<void> {
  try {
    // №26: транзакционные письма не увеличивают sent_today (не расходуют лимит рассылки).
    if (!transactional) await markSent(deps.store, acc, deps.now());
    else await markHealthy(deps.store, acc, deps.now());
  } catch (e) {
    await deps.log(`email_accounts: учёт отправки не записан: ${maskPii((e as Error).message ?? 'unknown')}`, { account: maskEmail(acc.email) });
  }
}

export async function sendMailWith(deps: NotifyDeps, opts: MailOptions): Promise<SendResult> {
  if (!isValidEmail(opts.to)) return { ok: false, reason: 'invalid', error: 'Некорректный адрес', code: null, accountId: null, attempts: 0 };
  const skip = new Set<string>(opts.excludeAccounts ?? []);
  let last: SmtpErrorInfo | null = null;
  let lastAccount: string | null = null;

  let attempts = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      if (opts.deadline !== undefined && deps.now().getTime() + backoffMs(attempt - 1) >= opts.deadline) break;
      await deps.sleep(backoffMs(attempt - 1));
    }
    const acc = await resolveAccount(deps, opts, skip);
    if (!acc) break;
    lastAccount = acc.id;
    attempts = attempt + 1;
    const r = await attemptSend(deps, acc, opts);
    if (r.ok) {
      await recordAccountSuccess(deps, acc, opts.transactional);
      return { ok: true, accountId: acc.id, fromEmail: acc.email, messageId: r.messageId, attempts: attempt + 1 };
    }
    last = r.info;
    await deps.log(`smtp ${r.info.kind}: ${r.info.message}`, { to: maskEmail(opts.to), account: maskEmail(acc.email), code: r.info.code, attempt: attempt + 1 });
    if (r.info.kind === 'hard_bounce') {
      return { ok: false, reason: 'hard_bounce', error: r.info.message, code: r.info.code, accountId: acc.id, attempts: attempt + 1 };
    }
    // Ящик с неверным паролем или упавшим SMTP: помечаем и пробуем другой (если ящик не задан явно).
    if (r.info.kind === 'auth' || r.info.kind === 'network') {
      await markFailed(deps.store, acc, r.info.message, deps.now());
      // Явно заданный ящик с неверным паролем повторять бессмысленно.
      if (opts.accountId && r.info.kind === 'auth') {
        return { ok: false, reason: 'auth', error: r.info.message, code: r.info.code, accountId: acc.id, attempts: attempt + 1 };
      }
      if (!opts.accountId) skip.add(acc.id);
    }
  }

  if (!last) return { ok: false, reason: 'no_account', error: 'Нет активного ящика с запасом лимита', code: null, accountId: null, attempts: 0 };
  return { ok: false, reason: last.kind, error: last.message, code: last.code, accountId: lastAccount, attempts };
}

// Транспорты кешируются в пределах инстанса: повторное TLS-рукопожатие на каждое письмо дорого.
const transportCache = new Map<string, MailTransport>();

function cachedTransport(opts: SmtpOptions): MailTransport {
  // Пароль входит в ключ только как хэш: смена пароля даёт новый транспорт, сам пароль в памяти ключей не лежит.
  const passHash = createHash('sha256').update(opts.auth.pass).digest('hex').slice(0, 16);
  const key = `${opts.host}:${opts.port}:${opts.auth.user}:${passHash}`;
  const hit = transportCache.get(key);
  if (hit) return hit;
  const t = nodemailer.createTransport(opts);
  transportCache.set(key, t);
  return t;
}

function defaultDeps(): NotifyDeps {
  return {
    store: supabaseAccountStore(),
    createTransport: cachedTransport,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (message, payload) => logError('email', message, payload),
    now: () => new Date(),
  };
}

export async function sendMailDetailed(opts: MailOptions): Promise<SendResult> {
  try {
    return await sendMailWith(defaultDeps(), opts);
  } catch (e) {
    // Ошибка БД/конфигурации (например, нет ENCRYPTION_KEY) — не SMTP. Логируем без PII.
    const message = maskPii((e as Error).message ?? 'unknown');
    await logError('email', `send failed: ${message}`, { to: maskEmail(opts.to) });
    return { ok: false, reason: 'network', error: message, code: null, accountId: null, attempts: 0 };
  }
}

// Прежний API: true — письмо ушло. Ошибки уже залогированы внутри.
export async function sendMail(opts: { to: string; subject: string; text: string; html?: string; transactional?: boolean }): Promise<boolean> {
  const r = await sendMailDetailed(opts);
  return r.ok;
}
