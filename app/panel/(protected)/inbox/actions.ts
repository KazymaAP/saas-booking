'use server';
// app/panel/(protected)/inbox/actions.ts — отметки и ответ клиенту из входящих (ТЗ §5.4 /panel/inbox).
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { sendMail } from '@/lib/notify';
import { logError } from '@/lib/log';

const UUID = /^[0-9a-f-]{36}$/i;

export async function markInboxRead(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  await adminClient().from('emails_incoming').update({ is_read: formData.get('read') === '1' }).eq('id', id);
  revalidatePath('/panel/inbox');
}

export async function replyToIncoming(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const text = String(formData.get('text') ?? '').trim().slice(0, 5000);
  if (!UUID.test(id) || text.length < 2) return;
  const db = adminClient();
  const { data: m } = await db.from('emails_incoming').select('from_email, subject, business_id').eq('id', id).maybeSingle();
  if (!m?.from_email) return;
  const subject = m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject ?? ''}`;
  const ok = await sendMail({ to: m.from_email, subject, text }).catch(() => false);
  if (!ok) {
    await logError('email', 'ответ не отправлен: нет ящика с лимитом или ошибка SMTP', { to: m.from_email });
  } else {
    await db.from('emails_outgoing').insert({
      business_id: m.business_id,
      to_email: m.from_email,
      subject,
      body_text: text,
      sent_at: new Date().toISOString(),
      status: 'sent',
    });
  }
  await db.from('emails_incoming').update({ is_read: true }).eq('id', id);
  revalidatePath('/panel/inbox');
}
