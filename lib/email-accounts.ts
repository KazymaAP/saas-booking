// lib/email-accounts.ts — ящики рассылки Yandex 360: выбор, лимиты, учёт отправок (ТЗ §4.16, §9.1).
// Ротация: active=true, sent_today < daily_limit, наименьший sent_today. Счётчик дня сбрасывается,
// если last_reset не совпадает с текущей датой по Москве (cron reset-email-limits идёт в 00:00 МСК).
// Работа с БД вынесена в интерфейс EmailAccountStore — так логику можно тестировать без Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from './supabase';
import { decryptSecret } from './crypto';

export type SecureMode = 'tls' | 'starttls' | 'none';

export interface EmailAccountRecord {
  id: string;
  email: string;
  from_name: string | null;
  reply_to: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: string | null;
  smtp_user: string | null;
  smtp_pass_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: string | null;
  imap_user: string | null;
  imap_pass_encrypted: string | null;
  daily_limit: number;
  sent_today: number;
  last_reset: string | null;
  active: boolean;
  last_error: string | null;
  last_checked_at: string | null;
}

// Колонки без лишнего: SELECT * запрещён.
export const ACCOUNT_COLUMNS =
  'id, email, from_name, reply_to, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_encrypted, ' +
  'imap_host, imap_port, imap_secure, imap_user, imap_pass_encrypted, daily_limit, sent_today, last_reset, ' +
  'active, last_error, last_checked_at';

export const DEFAULT_SMTP_HOST = 'smtp.yandex.ru';
export const DEFAULT_SMTP_PORT = 465;
export const DEFAULT_IMAP_HOST = 'imap.yandex.ru';
export const DEFAULT_IMAP_PORT = 993;
export const DEFAULT_DAILY_LIMIT = 50;
const MAX_ERROR_LENGTH = 300;
const MAX_INCREMENT_ATTEMPTS = 3;
const CACHE_TTL_MS = 30_000;
const MSK_TIMEZONE = 'Europe/Moscow';

// Дата YYYY-MM-DD по Москве: граница «дня» для лимитов совпадает с cron reset-email-limits.
export function todayMsk(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MSK_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Счётчик с учётом смены дня (без записи в БД).
export function effectiveSentToday(acc: Pick<EmailAccountRecord, 'sent_today' | 'last_reset'>, today: string): number {
  return acc.last_reset === today ? acc.sent_today : 0;
}

export function hasCapacity(acc: EmailAccountRecord, today: string, transactional = false): boolean {
  if (!acc.active || !acc.smtp_pass_encrypted) return false;
  // №26: транзакционные письма (уведомления о бронях, клиенту, доступ владельцу) не расходуют дневной
  // лимит холодной рассылки и не теряются, когда этот лимит исчерпан.
  if (transactional) return true;
  return effectiveSentToday(acc, today) < acc.daily_limit;
}

// Чистый выбор ящика. exclude — ящики, уже занятые в этом запуске (пауза 45 с между письмами ящика).
export function chooseAccount(accounts: EmailAccountRecord[], today: string, exclude: ReadonlySet<string> = new Set(), transactional = false): EmailAccountRecord | null {
  let best: EmailAccountRecord | null = null;
  for (const acc of accounts) {
    if (exclude.has(acc.id) || !hasCapacity(acc, today, transactional)) continue;
    if (!best || effectiveSentToday(acc, today) < effectiveSentToday(best, today)) best = acc;
  }
  return best;
}

export function remainingCapacity(accounts: EmailAccountRecord[], today: string): number {
  return accounts.reduce((sum, a) => sum + (hasCapacity(a, today) ? a.daily_limit - effectiveSentToday(a, today) : 0), 0);
}

export function normalizeSecure(value: string | null | undefined, port: number): SecureMode {
  if (value === 'tls' || value === 'starttls' || value === 'none') return value;
  return port === DEFAULT_SMTP_PORT || port === DEFAULT_IMAP_PORT ? 'tls' : 'starttls';
}

export type SmtpOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};

const SMTP_TIMEOUT_MS = 10_000;

export function smtpOptions(acc: EmailAccountRecord): SmtpOptions {
  if (!acc.smtp_pass_encrypted) throw new Error('У ящика нет SMTP-пароля');
  const port = acc.smtp_port ?? DEFAULT_SMTP_PORT;
  const mode = normalizeSecure(acc.smtp_secure, port);
  return {
    host: acc.smtp_host ?? DEFAULT_SMTP_HOST,
    port,
    secure: mode === 'tls',
    requireTLS: mode === 'starttls',
    auth: { user: acc.smtp_user ?? acc.email, pass: decryptSecret(acc.smtp_pass_encrypted) },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  };
}

export type ImapOptions = { host: string; port: number; secure: boolean; auth: { user: string; pass: string } };

// У Yandex 360 пароль приложения общий для SMTP и IMAP, поэтому SMTP-пароль — запасной вариант.
export function imapOptions(acc: EmailAccountRecord): ImapOptions | null {
  const encrypted = acc.imap_pass_encrypted ?? acc.smtp_pass_encrypted;
  if (!encrypted || !acc.imap_host) return null;
  const port = acc.imap_port ?? DEFAULT_IMAP_PORT;
  return {
    host: acc.imap_host,
    port,
    secure: normalizeSecure(acc.imap_secure, port) === 'tls',
    auth: { user: acc.imap_user ?? acc.smtp_user ?? acc.email, pass: decryptSecret(encrypted) },
  };
}

// Адрес отправителя с именем: «Имя <addr>». Кавычки и переводы строк из имени удаляются.
export function fromHeader(acc: Pick<EmailAccountRecord, 'email' | 'from_name'>): string {
  const name = (acc.from_name ?? '').replace(/["\r\n<>]/g, '').trim();
  return name ? `"${name}" <${acc.email}>` : acc.email;
}

export function shortError(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_LENGTH);
}

// ===== хранилище =====

export interface EmailAccountStore {
  listActive(): Promise<EmailAccountRecord[]>;
  getById(id: string): Promise<EmailAccountRecord | null>;
  resetDaily(today: string): Promise<void>;
  // Увеличивает sent_today, только если он всё ещё равен expected (оптимистичная блокировка).
  incrementIfUnchanged(id: string, expected: number, today: string): Promise<boolean>;
  setStatus(id: string, patch: { last_error: string | null; last_checked_at: string }): Promise<void>;
}

// Ответ Supabase-клиента без сгенерированных типов — приводим к нашей записи явно.
function asRecords(rows: unknown): EmailAccountRecord[] {
  return Array.isArray(rows) ? (rows as EmailAccountRecord[]) : [];
}

export function supabaseAccountStore(db: SupabaseClient = adminClient()): EmailAccountStore {
  return {
    async listActive() {
      const { data, error } = await db.from('email_accounts').select(ACCOUNT_COLUMNS).eq('active', true).order('sent_today').limit(100);
      if (error) throw new Error(`email_accounts: ${error.message}`);
      return asRecords(data);
    },
    async getById(id) {
      const { data, error } = await db.from('email_accounts').select(ACCOUNT_COLUMNS).eq('id', id).limit(1);
      if (error) throw new Error(`email_accounts: ${error.message}`);
      return asRecords(data)[0] ?? null;
    },
    async resetDaily(today) {
      const { error } = await db.from('email_accounts').update({ sent_today: 0, last_reset: today }).or(`last_reset.is.null,last_reset.neq.${today}`);
      if (error) throw new Error(`email_accounts reset: ${error.message}`);
    },
    async incrementIfUnchanged(id, expected, today) {
      const { data, error } = await db.from('email_accounts')
        .update({ sent_today: expected + 1, last_reset: today })
        .eq('id', id).eq('sent_today', expected).select('id');
      if (error) throw new Error(`email_accounts increment: ${error.message}`);
      return Array.isArray(data) && data.length > 0;
    },
    async setStatus(id, patch) {
      const { error } = await db.from('email_accounts').update(patch).eq('id', id);
      if (error) throw new Error(`email_accounts status: ${error.message}`);
    },
  };
}

// ===== кэш списка ящиков (в пределах инстанса) =====

let cache: { at: number; rows: EmailAccountRecord[] } | null = null;

export function invalidateAccountCache(): void {
  cache = null;
}

export async function loadAccounts(store: EmailAccountStore, now: number = Date.now()): Promise<EmailAccountRecord[]> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await store.listActive();
  cache = { at: now, rows };
  return rows;
}

// ===== операции =====

// Выбор ящика для одного письма. Сброс дневных счётчиков выполняется только при смене дня.
export async function pickAccount(store: EmailAccountStore, opts: { exclude?: ReadonlySet<string>; now?: Date; transactional?: boolean } = {}): Promise<EmailAccountRecord | null> {
  const now = opts.now ?? new Date();
  const today = todayMsk(now);
  const accounts = await loadAccounts(store, now.getTime());
  if (accounts.some((a) => a.last_reset !== today)) {
    await store.resetDaily(today);
    invalidateAccountCache();
  }
  return chooseAccount(accounts, today, opts.exclude, opts.transactional);
}

// Учёт успешной отправки. Гонка двух cron-вызовов решается повтором с перечитыванием счётчика.
export async function markSent(store: EmailAccountStore, acc: EmailAccountRecord, now: Date = new Date()): Promise<boolean> {
  const today = todayMsk(now);
  let expected = effectiveSentToday(acc, today);
  for (let attempt = 0; attempt < MAX_INCREMENT_ATTEMPTS; attempt += 1) {
    if (await store.incrementIfUnchanged(acc.id, expected, today)) {
      // Локальная копия тоже обновляется: следующий выбор в этом запуске видит новый счётчик.
      acc.sent_today = expected + 1;
      acc.last_reset = today;
      return true;
    }
    const fresh = await store.getById(acc.id);
    if (!fresh) return false;
    expected = effectiveSentToday(fresh, today);
  }
  return false;
}

export async function markFailed(store: EmailAccountStore, acc: Pick<EmailAccountRecord, 'id'>, message: string, now: Date = new Date()): Promise<void> {
  await store.setStatus(acc.id, { last_error: shortError(message), last_checked_at: now.toISOString() });
}

export async function markHealthy(store: EmailAccountStore, acc: Pick<EmailAccountRecord, 'id' | 'last_error'>, now: Date = new Date()): Promise<void> {
  if (acc.last_error === null) return;
  await store.setStatus(acc.id, { last_error: null, last_checked_at: now.toISOString() });
}

// Безопасная проекция для UI: без зашифрованных паролей.
export type PublicEmailAccount = Omit<EmailAccountRecord, 'smtp_pass_encrypted' | 'imap_pass_encrypted'> & {
  has_smtp_pass: boolean;
  has_imap_pass: boolean;
};

export function toPublicAccount(acc: EmailAccountRecord): PublicEmailAccount {
  const { smtp_pass_encrypted: smtp, imap_pass_encrypted: imap, ...rest } = acc;
  return { ...rest, has_smtp_pass: Boolean(smtp), has_imap_pass: Boolean(imap) };
}
