// lib/email-queue.ts — обработка очереди email_queue (ТЗ §4.17, §9.1, §9.2).
// pending → sending (атомарный claim) → sent | pending с next_retry_at | failed.
// Retry: 1-я неудача +1 ч, 2-я +4 ч, 3-я → failed + Telegram-алерт. Hard bounce → failed сразу.
// Один ящик — не больше одного письма за вызов cron (пауза 45 с между письмами ящика, ТЗ §9.1).
// Работа с БД — через интерфейс QueueStore: логика тестируется без Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from './supabase';
import { SITE_URL } from './site';
import { unsubscribeHeaders } from './outreach';
import { maskEmail, type MailOptions, type SendResult } from './notify';

export type QueueItem = {
  id: string;
  business_id: string | null;
  booking_id: string | null;
  email_account_id: string | null;
  to_email: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  retry_count: number;
  max_retries: number;
  message_id: string | null;
  in_reply_to: string | null;
  references: string | null;
  tracking_token: string;
};

export const QUEUE_COLUMNS =
  'id, business_id, booking_id, email_account_id, to_email, subject, body_text, body_html, retry_count, max_retries, ' +
  'message_id, in_reply_to, references, tracking_token';

export const MAX_PER_RUN = 50;
// Vercel Hobby — 10 с на функцию; оставляем запас на ответ и запись в БД.
export const TIME_BUDGET_MS = 8_000;
// Строка «sending» дольше этого времени — след упавшего вызова, возвращаем в pending.
export const STALE_SENDING_MS = 15 * 60_000;
const HOUR_MS = 3_600_000;
// Паузы между попытками по номеру неудачи (ТЗ: 1 ч; дерево решений промта: 1 ч, затем 4 ч).
const RETRY_DELAYS_MS = [HOUR_MS, 4 * HOUR_MS];
const DEFAULT_MAX_RETRIES = 3;
const SENT_RECORD_ATTEMPTS = 2;

export type Outcome = 'sent' | 'retry' | 'failed' | 'bounced' | 'unsubscribed' | 'suppressed' | 'skipped' | 'no_account';

export function retryDelayMs(failures: number): number {
  return RETRY_DELAYS_MS[Math.min(failures - 1, RETRY_DELAYS_MS.length - 1)] ?? HOUR_MS;
}

// Решение после неудачной отправки: следующая попытка или окончательный провал.
export function nextAttempt(item: Pick<QueueItem, 'retry_count' | 'max_retries'>, now: Date): { status: 'pending'; retry_count: number; next_retry_at: string } | { status: 'failed'; retry_count: number } {
  const failures = item.retry_count + 1;
  const limit = item.max_retries > 0 ? item.max_retries : DEFAULT_MAX_RETRIES;
  if (failures >= limit) return { status: 'failed', retry_count: failures };
  return { status: 'pending', retry_count: failures, next_retry_at: new Date(now.getTime() + retryDelayMs(failures)).toISOString() };
}

// Message-ID генерируется до отправки: по нему check-replies свяжет ответ (In-Reply-To) с письмом.
export function messageIdFor(item: Pick<QueueItem, 'tracking_token' | 'message_id'>, site: string = SITE_URL): string {
  if (item.message_id) return item.message_id;
  const host = new URL(site).hostname;
  return `<${item.tracking_token}@${host}>`;
}

export function mailFromItem(item: QueueItem, exclude: ReadonlySet<string>): MailOptions {
  return {
    to: item.to_email,
    subject: item.subject,
    text: item.body_text ?? '',
    html: item.body_html ?? undefined,
    headers: unsubscribeHeaders(item.tracking_token),
    messageId: messageIdFor(item),
    inReplyTo: item.in_reply_to ?? undefined,
    references: item.references ?? undefined,
    // Ответ из inbox привязан к ящику; остальные письма — ротация.
    accountId: item.email_account_id ?? undefined,
    excludeAccounts: exclude,
  };
}

export interface QueueStore {
  releaseStale(olderThanIso: string): Promise<void>;
  fetchDue(nowIso: string, limit: number): Promise<QueueItem[]>;
  // pending → sending; false — строку уже забрал другой вызов.
  claim(id: string): Promise<boolean>;
  release(id: string): Promise<void>;
  isUnsubscribed(email: string): Promise<boolean>;
  // Адрес уже давал hard bounce (нет ящика): повторная отправка вредит репутации отправителя.
  hasHardBounce(email: string): Promise<boolean>;
  markSent(item: QueueItem, r: { accountId: string; fromEmail: string; messageId: string | null }, nowIso: string): Promise<void>;
  markRetry(id: string, patch: { retry_count: number; next_retry_at: string; error: string }): Promise<void>;
  markFailed(item: QueueItem, patch: { retry_count: number; error: string }): Promise<void>;
  recordHardBounce(item: QueueItem, r: { accountId: string | null; reason: string }): Promise<void>;
}

export type QueueDeps = {
  store: QueueStore;
  send: (opts: MailOptions) => Promise<SendResult>;
  alert: (text: string) => Promise<void>;
  log: (message: string, payload: Record<string, unknown>) => Promise<unknown>;
  now: () => Date;
  maxPerRun?: number;
  budgetMs?: number;
};

export type RunStats = { sent: number; retried: number; failed: number; bounced: number; unsubscribed: number; suppressed: number; errors: number; stopped: 'empty' | 'limit' | 'budget' | 'no_account' };

async function handleFailure(deps: QueueDeps, item: QueueItem, r: Extract<SendResult, { ok: false }>): Promise<Outcome> {
  const now = deps.now();
  if (r.reason === 'hard_bounce' || r.reason === 'invalid') {
    await deps.store.recordHardBounce(item, { accountId: r.accountId, reason: r.error });
    await deps.store.markFailed(item, { retry_count: item.retry_count + 1, error: r.error });
    return 'bounced';
  }
  const next = nextAttempt(item, now);
  if (next.status === 'pending') {
    await deps.store.markRetry(item.id, { retry_count: next.retry_count, next_retry_at: next.next_retry_at, error: r.error });
    return 'retry';
  }
  await deps.store.markFailed(item, { retry_count: next.retry_count, error: r.error });
  await deps.log(`email_queue failed: ${r.error}`, { queue_id: item.id, to: maskEmail(item.to_email), attempts: next.retry_count });
  await deps.alert(`❌ Письмо не отправлено после ${next.retry_count} попыток: ${maskEmail(item.to_email)} — ${r.error}`);
  return 'failed';
}

// Письмо уже ушло по SMTP: сбой записи в БД не должен превращаться в ошибку письма.
// Иначе строка останется в sending, releaseStale вернёт её в pending — и получатель получит дубль.
// Одна повторная попытка записи; если и она неудачна — громкий лог, письмо считается отправленным.
async function recordSent(deps: QueueDeps, item: QueueItem, r: Extract<SendResult, { ok: true }>): Promise<void> {
  for (let attempt = 1; attempt <= SENT_RECORD_ATTEMPTS; attempt += 1) {
    try {
      await deps.store.markSent(item, r, deps.now().toISOString());
      return;
    } catch (e) {
      if (attempt === SENT_RECORD_ATTEMPTS) {
        await deps.log(`email_queue: письмо отправлено, но не записано: ${(e as Error).message}`, { queue_id: item.id, to: maskEmail(item.to_email) });
      }
    }
  }
}

// Одно письмо очереди. Возвращает исход для статистики.
// deadline — момент (epoch ms), после которого повторные SMTP-попытки внутри вызова не начинаются.
export async function processItem(deps: QueueDeps, item: QueueItem, usedAccounts: Set<string>, deadline?: number): Promise<Outcome> {
  if (!(await deps.store.claim(item.id))) return 'skipped';
  if (await deps.store.isUnsubscribed(item.to_email)) {
    await deps.store.markFailed(item, { retry_count: item.retry_count, error: 'unsubscribed' });
    return 'unsubscribed';
  }
  if (await deps.store.hasHardBounce(item.to_email)) {
    await deps.store.markFailed(item, { retry_count: item.retry_count, error: 'suppressed: hard bounce' });
    return 'suppressed';
  }
  // Привязанный ящик уже отправлял в этом вызове — ждём следующего запуска (пауза 45 с).
  if (item.email_account_id && usedAccounts.has(item.email_account_id)) {
    await deps.store.release(item.id);
    return 'skipped';
  }
  const r = await deps.send({ ...mailFromItem(item, usedAccounts), deadline });
  if (r.ok) {
    usedAccounts.add(r.accountId);
    await recordSent(deps, item, r);
    return 'sent';
  }
  if (r.reason === 'no_account') {
    // Не ошибка письма: свободных ящиков нет. Попытка не тратится.
    await deps.store.release(item.id);
    return 'no_account';
  }
  if (r.accountId) usedAccounts.add(r.accountId);
  return handleFailure(deps, item, r);
}

const COUNTERS: Partial<Record<Outcome, keyof Omit<RunStats, 'stopped' | 'errors'>>> = {
  sent: 'sent', retry: 'retried', failed: 'failed', bounced: 'bounced', unsubscribed: 'unsubscribed', suppressed: 'suppressed',
};

// Цикл cron: до MAX_PER_RUN писем, в пределах бюджета времени.
export async function runQueue(deps: QueueDeps): Promise<RunStats> {
  const started = deps.now().getTime();
  const maxPerRun = deps.maxPerRun ?? MAX_PER_RUN;
  const budget = deps.budgetMs ?? TIME_BUDGET_MS;
  const stats: RunStats = { sent: 0, retried: 0, failed: 0, bounced: 0, unsubscribed: 0, suppressed: 0, errors: 0, stopped: 'empty' };
  const used = new Set<string>();
  const deadline = started + budget;

  await deps.store.releaseStale(new Date(started - STALE_SENDING_MS).toISOString());
  const items = await deps.store.fetchDue(deps.now().toISOString(), maxPerRun);
  for (const item of items) {
    if (stats.sent >= maxPerRun) return { ...stats, stopped: 'limit' };
    if (deps.now().getTime() >= deadline) return { ...stats, stopped: 'budget' };
    let outcome: Outcome;
    try {
      outcome = await processItem(deps, item, used, deadline);
    } catch (e) {
      // Сбой БД на одном письме не останавливает очередь: строка вернётся через releaseStale.
      stats.errors += 1;
      await deps.log(`email_queue item: ${(e as Error).message}`, { queue_id: item.id });
      continue;
    }
    if (outcome === 'no_account') return { ...stats, stopped: 'no_account' };
    const key = COUNTERS[outcome];
    if (key) stats[key] += 1;
  }
  return stats;
}

// ===== Supabase =====

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function afterSent(db: SupabaseClient, item: QueueItem, r: { accountId: string; fromEmail: string; messageId: string | null }, nowIso: string): Promise<void> {
  const out = await db.from('emails_outgoing').insert({
    business_id: item.business_id, booking_id: item.booking_id, from_email: r.fromEmail, to_email: item.to_email,
    subject: item.subject, body_text: item.body_text, body_html: item.body_html, message_id: r.messageId,
    email_account_id: r.accountId, sent_at: nowIso, status: 'sent',
  });
  check(out.error, 'emails_outgoing');
  const log = await db.from('outreach_log').update({ status: 'sent', sent_at: nowIso, email_account_id: r.accountId })
    .eq('tracking_token', item.tracking_token).select('business_id');
  check(log.error, 'outreach_log');
  // Статус воронки меняется только для outreach-писем и только из approved.
  if (item.business_id && (log.data ?? []).length > 0) {
    const biz = await db.from('businesses').update({ status: 'sent' }).eq('id', item.business_id).eq('status', 'approved');
    check(biz.error, 'businesses');
  }
}

// Переходы статусов очереди: выборка, claim, возврат.
function queueStateOps(db: SupabaseClient): Pick<QueueStore, 'releaseStale' | 'fetchDue' | 'claim' | 'release' | 'isUnsubscribed' | 'hasHardBounce' | 'markRetry'> {
  return {
    async releaseStale(olderThanIso) {
      const { error } = await db.from('email_queue').update({ status: 'pending' }).eq('status', 'sending').lt('updated_at', olderThanIso);
      check(error, 'email_queue release stale');
    },
    async fetchDue(nowIso, limit) {
      const { data, error } = await db.from('email_queue').select(QUEUE_COLUMNS)
        .eq('status', 'pending').lte('next_retry_at', nowIso).order('next_retry_at', { ascending: true }).limit(limit);
      check(error, 'email_queue fetch');
      return (data ?? []) as unknown as QueueItem[];
    },
    async claim(id) {
      const { data, error } = await db.from('email_queue').update({ status: 'sending' }).eq('id', id).eq('status', 'pending').select('id');
      check(error, 'email_queue claim');
      return (data ?? []).length > 0;
    },
    async release(id) {
      const { error } = await db.from('email_queue').update({ status: 'pending' }).eq('id', id).eq('status', 'sending');
      check(error, 'email_queue release');
    },
    async isUnsubscribed(email) {
      const { data, error } = await db.from('unsubscribes').select('id').eq('email', email.trim().toLowerCase()).limit(1);
      check(error, 'unsubscribes');
      return (data ?? []).length > 0;
    },
    async hasHardBounce(email) {
      const { data, error } = await db.from('email_bounces').select('id').eq('bounced_email', email.trim().toLowerCase()).eq('bounce_type', 'hard').limit(1);
      check(error, 'email_bounces');
      return (data ?? []).length > 0;
    },
    async markRetry(id, patch) {
      const { error } = await db.from('email_queue').update({ status: 'pending', ...patch }).eq('id', id);
      check(error, 'email_queue retry');
    },
  };
}

// Итоги отправки: запись результата и побочные эффекты (журнал, воронка, bounce).
function queueResultOps(db: SupabaseClient): Pick<QueueStore, 'markSent' | 'markFailed' | 'recordHardBounce'> {
  return {
    async markSent(item, r, nowIso) {
      const { error } = await db.from('email_queue').update({
        status: 'sent', sent_at: nowIso, message_id: r.messageId, email_account_id: r.accountId, error: null,
      }).eq('id', item.id);
      check(error, 'email_queue sent');
      await afterSent(db, item, r, nowIso);
    },
    async markFailed(item, patch) {
      const { error } = await db.from('email_queue').update({ status: 'failed', ...patch }).eq('id', item.id);
      check(error, 'email_queue failed');
      const log = await db.from('outreach_log').update({ status: 'failed', error: patch.error, retry_count: patch.retry_count }).eq('tracking_token', item.tracking_token);
      check(log.error, 'outreach_log failed');
    },
    async recordHardBounce(item, r) {
      const b = await db.from('email_bounces').insert({
        email_account_id: r.accountId, original_message_id: messageIdFor(item), bounced_email: item.to_email.toLowerCase(),
        bounce_type: 'hard', reason: r.reason.slice(0, 500),
      });
      check(b.error, 'email_bounces');
      if (item.business_id) {
        const biz = await db.from('businesses').update({ status: 'no_contact' }).eq('id', item.business_id).in('status', ['approved', 'sent']);
        check(biz.error, 'businesses no_contact');
      }
    },
  };
}

export function supabaseQueueStore(db: SupabaseClient = adminClient()): QueueStore {
  return { ...queueStateOps(db), ...queueResultOps(db) };
}
