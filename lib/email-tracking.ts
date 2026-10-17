// lib/email-tracking.ts — открытия, клики и отписка по tracking_token (ТЗ §9.3, §9.5).
// Токен — uuid из email_queue.tracking_token (общий с outreach_log). Старые письма до перехода на очередь
// несут 32-hex токен outreach_log — они тоже обрабатываются, чтобы не терять статистику.
// Все записи идемпотентны: фиксируется только первое открытие/клик (`is null` в условии update).
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from './supabase';
import { hitRateLimit } from './rate-limit';
import { logError } from './log';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_RE = /^[0-9a-f]{32}$/i;
// ТЗ/промт: 1000 запросов в час с одного IP на трекинг.
export const TRACK_LIMIT = 1000;
export const TRACK_WINDOW_SECONDS = 3600;

export type TokenKind = 'queue' | 'legacy' | 'invalid';
export type TrackEvent = 'opened_at' | 'clicked_at';

export function tokenKind(token: string): TokenKind {
  if (UUID_RE.test(token)) return 'queue';
  if (LEGACY_RE.test(token)) return 'legacy';
  return 'invalid';
}

// IP клиента за прокси Vercel: первый адрес из X-Forwarded-For.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

// Fail open: если хранилище лимитов недоступно, трекинг не должен ломать письмо — пропускаем запрос.
export async function allowTrack(scope: string, ip: string, limiter: typeof hitRateLimit = hitRateLimit): Promise<boolean> {
  try {
    return await limiter(`track:${scope}:${ip}`, TRACK_LIMIT, TRACK_WINDOW_SECONDS);
  } catch (e) {
    await logError('email', `rate limit недоступен: ${(e as Error).message}`, { scope });
    return true;
  }
}

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function markOutgoing(db: SupabaseClient, event: TrackEvent, nowIso: string, by: { message_id?: string; outreach_log_id?: string }): Promise<void> {
  const base = db.from('emails_outgoing').update({ [event]: nowIso }).is(event, null);
  const q = by.message_id ? base.eq('message_id', by.message_id) : base.eq('outreach_log_id', by.outreach_log_id ?? '');
  const { error } = await q;
  check(error, 'emails_outgoing track');
}

// Записывает первое открытие/клик. Неизвестный токен — молча игнорируется (ответ клиенту одинаковый).
export async function recordEvent(token: string, event: TrackEvent, now: Date = new Date(), db: SupabaseClient = adminClient()): Promise<void> {
  const kind = tokenKind(token);
  if (kind === 'invalid') return;
  const nowIso = now.toISOString();
  const log = await db.from('outreach_log').update({ [event]: nowIso }).eq('tracking_token', token).is(event, null).select('id');
  check(log.error, 'outreach_log track');
  const logId = (log.data as { id: string }[] | null)?.[0]?.id;

  if (kind === 'legacy') {
    if (logId) await markOutgoing(db, event, nowIso, { outreach_log_id: logId });
    return;
  }
  const q = await db.from('email_queue').select('message_id, business_id').eq('tracking_token', token).limit(1);
  check(q.error, 'email_queue track');
  const row = (q.data as { message_id: string | null; business_id: string | null }[] | null)?.[0];
  if (row?.message_id) await markOutgoing(db, event, nowIso, { message_id: row.message_id });
  // Открытие outreach-письма двигает воронку sent → viewed (ТЗ §5.5).
  if (event === 'opened_at' && logId && row?.business_id) {
    const biz = await db.from('businesses').update({ status: 'viewed' }).eq('id', row.business_id).eq('status', 'sent');
    check(biz.error, 'businesses viewed');
  }
}

// Безопасная обёртка для route: ошибки логируются, наружу не выходят.
export async function recordEventSafe(token: string, event: TrackEvent): Promise<void> {
  try {
    await recordEvent(token, event);
  } catch (e) {
    await logError('email', `track ${event}: ${(e as Error).message}`);
  }
}

// ===== отписка =====

export type UnsubscribeResult = { ok: true; already: boolean } | { ok: false; reason: 'invalid' | 'not_found' };

// Адрес по токену письма. Токен unsubscribes (если письмо пришло со ссылкой из таблицы) тоже принимается.
async function emailForToken(db: SupabaseClient, token: string): Promise<string | null> {
  const q = await db.from('email_queue').select('to_email').eq('tracking_token', token).limit(1);
  check(q.error, 'email_queue unsubscribe');
  const fromQueue = (q.data as { to_email: string }[] | null)?.[0]?.to_email;
  if (fromQueue) return fromQueue.trim().toLowerCase();
  const u = await db.from('unsubscribes').select('email').eq('token', token).limit(1);
  check(u.error, 'unsubscribes lookup');
  return (u.data as { email: string }[] | null)?.[0]?.email ?? null;
}

export async function unsubscribeByToken(token: string, reason: string, db: SupabaseClient = adminClient()): Promise<UnsubscribeResult> {
  if (tokenKind(token) !== 'queue') return { ok: false, reason: 'invalid' };
  const email = await emailForToken(db, token);
  if (!email) return { ok: false, reason: 'not_found' };
  const existing = await db.from('unsubscribes').select('id').eq('email', email).limit(1);
  check(existing.error, 'unsubscribes');
  if ((existing.data ?? []).length > 0) return { ok: true, already: true };
  // ON CONFLICT (email) DO NOTHING: повторный клик или гонка двух запросов не создают дубль.
  const ins = await db.from('unsubscribes').upsert({ email, reason: reason.slice(0, 200) }, { onConflict: 'email', ignoreDuplicates: true });
  check(ins.error, 'unsubscribes insert');
  // Неотправленные письма на этот адрес больше не уходят.
  const cancel = await db.from('email_queue').update({ status: 'failed', error: 'unsubscribed' }).eq('to_email', email).eq('status', 'pending');
  check(cancel.error, 'email_queue cancel');
  return { ok: true, already: false };
}

export async function isTokenKnown(token: string, db: SupabaseClient = adminClient()): Promise<boolean> {
  if (tokenKind(token) !== 'queue') return false;
  return (await emailForToken(db, token)) !== null;
}
