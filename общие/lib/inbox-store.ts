// lib/inbox-store.ts — реализация InboxStore на Supabase (таблицы ТЗ §4.18–4.23).
// Вложения — в Storage, бакет `email`, путь `{message_id}/{filename}` (аналог MinIO `email/{message_id}/{filename}`, ТЗ §9.4).
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from './supabase';
import { nextAttempt } from './email-queue';
import type { BounceInfo } from './email-inbound';
import type { ImapState, InboxStore, StoredAttachment } from './inbox-sync';

export const ATTACHMENTS_BUCKET = 'email';
// Статусы воронки, из которых ответ переводит бизнес в replied.
const REPLY_FROM = ['sent', 'viewed'];
const BOUNCE_FROM = ['approved', 'sent', 'viewed'];
const UNIQUE_VIOLATION = '23505';

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

type BizRef = { business_id: string | null };

// Бизнес, которому ушло письмо: сначала по Message-ID, затем по адресу.
async function businessForBounce(db: SupabaseClient, b: BounceInfo): Promise<string | null> {
  if (b.originalMessageId) {
    const { data, error } = await db.from('emails_outgoing').select('business_id').eq('message_id', b.originalMessageId).limit(1);
    check(error, 'emails_outgoing');
    const hit = (data as BizRef[] | null)?.[0]?.business_id;
    if (hit) return hit;
  }
  if (!b.recipient) return null;
  const { data, error } = await db.from('businesses').select('id').contains('emails', [b.recipient]).limit(1);
  check(error, 'businesses');
  return (data as { id: string }[] | null)?.[0]?.id ?? null;
}

type QueueRef = { id: string; retry_count: number; max_retries: number };

async function queueRowForBounce(db: SupabaseClient, b: BounceInfo): Promise<QueueRef | null> {
  const base = db.from('email_queue').select('id, retry_count, max_retries').eq('status', 'sent');
  const filtered = b.originalMessageId ? base.eq('message_id', b.originalMessageId) : b.recipient ? base.eq('to_email', b.recipient) : null;
  if (!filtered) return null;
  const { data, error } = await filtered.order('sent_at', { ascending: false }).limit(1);
  check(error, 'email_queue');
  return (data as QueueRef[] | null)?.[0] ?? null;
}

// UID-состояние и поиск связей (бизнес, цепочка).
function lookupOps(db: SupabaseClient): Pick<InboxStore, 'getState' | 'saveState' | 'incomingExists' | 'findByMessageIds' | 'findBusinessByEmail' | 'findBusinessByDomain'> {
  return {
    async getState(accountId) {
      const { data, error } = await db.from('imap_state').select('uidvalidity, uidnext').eq('email_account_id', accountId).limit(1);
      check(error, 'imap_state');
      const row = (data as ImapState[] | null)?.[0];
      return row ? { uidvalidity: Number(row.uidvalidity), uidnext: Number(row.uidnext) } : null;
    },
    async saveState(accountId, state, nowIso) {
      const { error } = await db.from('imap_state').upsert({ email_account_id: accountId, ...state, last_check_at: nowIso });
      check(error, 'imap_state save');
    },
    async incomingExists(messageId) {
      const { data, error } = await db.from('emails_incoming').select('id').eq('message_id', messageId).limit(1);
      check(error, 'emails_incoming');
      return (data ?? []).length > 0;
    },
    async findByMessageIds(ids) {
      const out = await db.from('emails_outgoing').select('business_id, message_id').in('message_id', ids).limit(1);
      check(out.error, 'emails_outgoing');
      const outRow = (out.data as BizRef[] | null)?.[0];
      const inc = await db.from('emails_incoming').select('business_id, thread_id').in('message_id', ids).limit(1);
      check(inc.error, 'emails_incoming');
      const incRow = (inc.data as (BizRef & { thread_id: string | null })[] | null)?.[0];
      if (!outRow && !incRow) return null;
      return { business_id: outRow?.business_id ?? incRow?.business_id ?? null, thread_id: incRow?.thread_id ?? null };
    },
    async findBusinessByEmail(email) {
      const { data, error } = await db.from('businesses').select('id').contains('emails', [email]).limit(1);
      check(error, 'businesses');
      return (data as { id: string }[] | null)?.[0]?.id ?? null;
    },
    async findBusinessByDomain(domain) {
      const { data, error } = await db.from('businesses').select('id').overlaps('websites', [domain, `www.${domain}`, `https://${domain}`, `http://${domain}`]).limit(1);
      check(error, 'businesses');
      return (data as { id: string }[] | null)?.[0]?.id ?? null;
    },
  };
}

// Сохранение входящих и вложений, отметка ответа в воронке.
function writeOps(db: SupabaseClient): Pick<InboxStore, 'insertIncoming' | 'saveAttachment' | 'setAttachments' | 'markReplied'> {
  return {
    async insertIncoming(row) {
      const { data, error } = await db.from('emails_incoming').insert({ ...row, is_read: false }).select('id').limit(1);
      if (error?.code === UNIQUE_VIOLATION) return null;
      check(error, 'emails_incoming insert');
      return (data as { id: string }[] | null)?.[0]?.id ?? null;
    },
    async saveAttachment(incomingId, folder, filename, att) {
      const path = `${folder}/${filename}`;
      const up = await db.storage.from(ATTACHMENTS_BUCKET).upload(path, att.content, { contentType: att.contentType, upsert: true });
      check(up.error, 'storage upload');
      const meta: StoredAttachment = { filename, mime_type: att.contentType, size_bytes: att.size, minio_path: `${ATTACHMENTS_BUCKET}/${path}` };
      const ins = await db.from('email_attachments').insert({ email_incoming_id: incomingId, ...meta });
      check(ins.error, 'email_attachments');
      return meta;
    },
    async setAttachments(incomingId, list) {
      const { error } = await db.from('emails_incoming').update({ attachments: list }).eq('id', incomingId);
      check(error, 'emails_incoming attachments');
    },
    async markReplied(businessId, text, nowIso) {
      const { error } = await db.from('businesses').update({ status: 'replied', reply_text: text, reply_received_at: nowIso })
        .eq('id', businessId).in('status', REPLY_FROM);
      check(error, 'businesses replied');
    },
  };
}

// Bounce: журнал, hard → no_contact, soft → повтор письма.
function bounceOps(db: SupabaseClient): Pick<InboxStore, 'recordBounce' | 'applyHardBounce' | 'applySoftBounce'> {
  return {
    async recordBounce(accountId, b, raw) {
      const { error } = await db.from('email_bounces').insert({
        email_account_id: accountId, original_message_id: b.originalMessageId, bounced_email: b.recipient,
        bounce_type: b.type, reason: b.reason, raw,
      });
      check(error, 'email_bounces');
    },
    async applyHardBounce(b) {
      const businessId = await businessForBounce(db, b);
      if (!businessId) return;
      const { error } = await db.from('businesses').update({ status: 'no_contact' }).eq('id', businessId).in('status', BOUNCE_FROM);
      check(error, 'businesses no_contact');
    },
    async applySoftBounce(b, nowIso) {
      const row = await queueRowForBounce(db, b);
      if (!row) return;
      const next = nextAttempt(row, new Date(nowIso));
      const patch = next.status === 'pending'
        ? { status: 'pending', retry_count: next.retry_count, next_retry_at: next.next_retry_at, error: `soft bounce: ${b.reason}` }
        : { status: 'failed', retry_count: next.retry_count, error: `soft bounce: ${b.reason}` };
      const { error } = await db.from('email_queue').update(patch).eq('id', row.id).eq('status', 'sent');
      check(error, 'email_queue soft bounce');
    },
  };
}

export function supabaseInboxStore(db: SupabaseClient = adminClient()): InboxStore {
  return { ...lookupOps(db), ...writeOps(db), ...bounceOps(db) };
}
