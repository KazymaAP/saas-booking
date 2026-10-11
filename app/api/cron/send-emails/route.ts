// app/api/cron/send-emails/route.ts — отправка одного письма из очереди (ТЗ §5.5, §26: раз в минуту).
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { isCronAuthorized } from '@/lib/cron';
import { sendMail } from '@/lib/notify';
import { buildEmail } from '@/lib/outreach';
import { logError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-notify';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = adminClient();

  // Самая ранняя запись в очереди.
  const { data: item } = await db
    .from('outreach_log').select('id, business_id, tracking_token, template_id')
    .eq('status', 'queued').order('id', { ascending: true }).limit(1).maybeSingle();
  if (!item) return NextResponse.json({ ok: true, sent: 0 });

  const { data: business } = await db
    .from('businesses')
    .select('*, vertical_templates(name)')
    .eq('id', item.business_id).single();
  if (!business || !business.emails?.[0] || business.status !== 'approved') {
    await db.from('outreach_log').update({ status: 'skipped' }).eq('id', item.id);
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const { data: tpl } = item.template_id && item.template_id !== 'default'
    ? await db.from('templates').select('subject, body').eq('id', item.template_id).maybeSingle()
    : { data: null };

  const email = buildEmail({
    business,
    trackingToken: item.tracking_token,
    verticalName: business.vertical_templates?.name?.toLowerCase(),
    subject: tpl?.subject ?? undefined,
    body: tpl?.body ?? undefined,
  });

  const ok = await sendMail({ to: business.emails[0], subject: email.subject, text: email.text, html: email.html }).catch(() => false);
  if (!ok) await logError('email', 'письмо не отправлено: нет ящика с лимитом или ошибка SMTP', { business: business.id });
  if (!ok) await notifyAdmin('❌ SMTP error: письмо не отправлено');
  if (!ok) return NextResponse.json({ ok: true, sent: 0, reason: 'no_capacity' });

  const now = new Date().toISOString();
  await db.from('emails_outgoing').insert({
    business_id: business.id,
    outreach_log_id: item.id,
    to_email: business.emails[0],
    subject: email.subject,
    body_text: email.text,
    body_html: email.html,
    sent_at: now,
    status: 'sent',
  });
  await db.from('outreach_log').update({ status: 'sent', sent_at: now }).eq('id', item.id);
  await db.from('businesses').update({ status: 'sent' }).eq('id', business.id);

  return NextResponse.json({ ok: true, sent: 1 });
}
