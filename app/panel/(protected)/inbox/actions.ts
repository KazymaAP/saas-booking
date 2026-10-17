'use server';
// app/panel/(protected)/inbox/actions.ts — отметки прочитано/непрочитано и ответ из входящих (ТЗ §13.4).
// Ответ ставится в email_queue (ТЗ §9.2: все письма — через очередь) с ящиком, который принял письмо,
// и заголовками In-Reply-To/References — так ответ попадает в ту же цепочку у получателя.
// Идемпотентность: повторная отправка той же формы не создаёт второй ответ (проверка pending-ответа).
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { adminClient } from '@/lib/supabase';
import { isSuperAdmin } from '@/lib/admin-session';
import { audit } from '@/lib/audit';
import { logError } from '@/lib/log';
import { isValidEmail, maskEmail } from '@/lib/notify';
import { renderEmail } from '@/lib/email-render';
import { trackingUrls } from '@/lib/outreach';
import { isUuidValue, replyReferences, replySubject } from '@/lib/email-panel';

export type InboxActionState = { ok: boolean; message: string };

const PAGE = '/panel/inbox';
const MAX_REPLY = 5_000;
const MIN_REPLY = 2;
const MAX_BULK = 200;
const DENIED: InboxActionState = { ok: false, message: 'Нет доступа' };

type IncomingForReply = {
  id: string; from_email: string | null; subject: string | null; business_id: string | null;
  email_account_id: string | null; message_id: string | null; references: string | null;
};

export async function setRead(ids: string[], read: boolean): Promise<InboxActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  const valid = ids.filter(isUuidValue).slice(0, MAX_BULK);
  if (valid.length === 0) return { ok: false, message: 'Нечего отмечать' };
  const { error } = await adminClient().from('emails_incoming').update({ is_read: read }).in('id', valid);
  if (error) {
    await logError('email', `inbox mark: ${error.message}`);
    return { ok: false, message: 'Не удалось сохранить отметку' };
  }
  revalidatePath(PAGE);
  return { ok: true, message: read ? 'Отмечено прочитанным' : 'Отмечено непрочитанным' };
}

async function loadIncoming(id: string): Promise<IncomingForReply | null> {
  const { data, error } = await adminClient().from('emails_incoming')
    .select('id, from_email, subject, business_id, email_account_id, message_id, references').eq('id', id).limit(1);
  if (error) throw new Error(`emails_incoming: ${error.message}`);
  return ((data ?? []) as IncomingForReply[])[0] ?? null;
}

async function replyPending(messageId: string): Promise<boolean> {
  const { data, error } = await adminClient().from('email_queue').select('id').eq('in_reply_to', messageId).in('status', ['pending', 'sending']).limit(1);
  if (error) throw new Error(`email_queue: ${error.message}`);
  return (data ?? []).length > 0;
}

function validateReply(m: IncomingForReply | null): string | null {
  if (!m?.from_email || !isValidEmail(m.from_email)) return 'Письмо не найдено или у него нет адреса отправителя';
  if (!m.email_account_id) return 'Неизвестен ящик, принявший письмо — ответ из того же ящика невозможен';
  return null;
}

async function enqueueReply(m: IncomingForReply, text: string): Promise<InboxActionState> {
  const token = randomUUID();
  const subject = replySubject(m.subject);
  // Тот же рендер, что у остальных писем: экранирование, inline CSS, ссылка отписки в футере.
  const mail = renderEmail({ subject, body_text: text }, { unsubscribe_url: trackingUrls(token).unsubscribePage });
  const { error } = await adminClient().from('email_queue').insert({
    business_id: m.business_id, email_account_id: m.email_account_id, to_email: (m.from_email ?? '').toLowerCase(),
    subject: mail.subject, body_text: mail.text, body_html: mail.html, status: 'pending', next_retry_at: new Date().toISOString(),
    in_reply_to: m.message_id, references: replyReferences(m), tracking_token: token,
  });
  if (error) {
    await logError('email', `inbox reply enqueue: ${error.message}`, { to: maskEmail(m.from_email) });
    return { ok: false, message: 'Не удалось поставить ответ в очередь' };
  }
  return { ok: true, message: 'Ответ поставлен в очередь, уйдёт в течение пары минут' };
}

// Ответ на входящее. Подходит для useFormState: (prev, formData).
export async function replyToIncoming(_prev: InboxActionState, formData: FormData): Promise<InboxActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  const id = String(formData.get('id') ?? '');
  const text = String(formData.get('text') ?? '').trim().slice(0, MAX_REPLY);
  if (!isUuidValue(id)) return { ok: false, message: 'Неверное письмо' };
  if (text.length < MIN_REPLY) return { ok: false, message: 'Напишите текст ответа' };
  try {
    const m = await loadIncoming(id);
    const invalid = validateReply(m);
    if (invalid || !m) return { ok: false, message: invalid ?? 'Письмо не найдено' };
    if (m.message_id && (await replyPending(m.message_id))) return { ok: false, message: 'Ответ на это письмо уже ждёт отправки' };
    const r = await enqueueReply(m, text);
    if (!r.ok) return r;
    const mark = await adminClient().from('emails_incoming').update({ is_read: true }).eq('id', id);
    if (mark.error) await logError('email', `inbox mark after reply: ${mark.error.message}`);
    await audit('inbox_reply', 'email_incoming', id, { to: maskEmail(m.from_email) }).catch((e: unknown) => logError('email', `audit inbox_reply: ${(e as Error).message}`));
    revalidatePath(PAGE);
    return r;
  } catch (e) {
    await logError('email', `inbox reply: ${(e as Error).message}`);
    return { ok: false, message: 'Ошибка сервера, ответ не отправлен' };
  }
}
