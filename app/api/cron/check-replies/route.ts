// app/api/cron/check-replies/route.ts — входящие ответы по IMAP (ТЗ §5.5, §26: раз в 5 минут).
// Связка с бизнесом: сначала по адресу отправителя, затем по домену. Без AI и классификации (§5.5, §8).
import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { adminClient } from '@/lib/supabase';
import { isCronAuthorized } from '@/lib/cron';
import { decryptSecret } from '@/lib/crypto';
import type { EmailAccount } from '@/lib/database.types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = adminClient();
  const { data: accounts } = await db.from('email_accounts').select('*').eq('active', true);
  let stored = 0;

  for (const acc of (accounts ?? []) as EmailAccount[]) {
    if (!acc.smtp_pass_encrypted || !acc.imap_host) continue;
    const client = new ImapFlow({
      host: acc.imap_host,
      port: acc.imap_port ?? 993,
      secure: true,
      auth: { user: acc.smtp_user ?? acc.email, pass: decryptSecret(acc.smtp_pass_encrypted) },
      logger: false,
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const since = new Date(Date.now() - 7 * 86_400_000);
        const uids = (await client.search({ seen: false, since }, { uid: true })) || [];
        for (const uid of uids) {
          const msg = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true });
          if (!msg || !msg.envelope) continue;
          const fromAddr = (msg.envelope.from?.[0]?.address ?? '').toLowerCase();
          const fromDomain = fromAddr.split('@')[1] ?? '';
          const subject = msg.envelope.subject ?? '';
          const text = extractText(msg.source?.toString('utf8') ?? '');

          const business = await matchBusiness(fromAddr, fromDomain);
          await db.from('emails_incoming').insert({
            business_id: business?.id ?? null,
            from_email: fromAddr,
            to_email: acc.email,
            subject,
            body_text: text.slice(0, 5000),
            received_at: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
            is_read: false,
          });
          if (business && (business.status === 'sent' || business.status === 'viewed')) {
            await db.from('businesses').update({ status: 'replied', reply_text: text.slice(0, 500), reply_received_at: new Date().toISOString() }).eq('id', business.id);
          }
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          stored++;
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch {
      // сбой одного ящика не останавливает остальные
      await client.close().catch(() => undefined);
    }
  }
  return NextResponse.json({ ok: true, stored });
}

async function matchBusiness(email: string, domain: string) {
  const db = adminClient();
  const { data: byEmail } = await db.from('businesses').select('id, status').contains('emails', [email]).maybeSingle();
  if (byEmail) return byEmail;
  if (!domain) return null;
  const { data: byDomain } = await db.from('businesses').select('id, status').contains('websites', [domain]).limit(1).maybeSingle();
  return byDomain;
}

// Упрощённый разбор: берём текст после пустой строки заголовков; без вложений и HTML-разбора.
function extractText(source: string): string {
  const idx = source.indexOf('\r\n\r\n') >= 0 ? source.indexOf('\r\n\r\n') : source.indexOf('\n\n');
  return (idx >= 0 ? source.slice(idx + 4) : source).replace(/\r/g, '').trim();
}
