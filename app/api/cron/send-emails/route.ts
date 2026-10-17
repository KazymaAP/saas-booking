// app/api/cron/send-emails/route.ts — отправка писем из email_queue (ТЗ §9.1, §9.2; cron раз в минуту).
// До 50 писем за вызов в пределах 8 с; логика очереди — lib/email-queue.ts.
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron';
import { sendMailDetailed, maskPii } from '@/lib/notify';
import { runQueue, supabaseQueueStore } from '@/lib/email-queue';
import { logError } from '@/lib/log';
import { notifyAdmin } from '@/lib/admin-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

async function alert(text: string): Promise<void> {
  const ok = await notifyAdmin(text);
  if (!ok) await logError('email', 'telegram alert не доставлен', { channel: 'admin' });
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const stats = await runQueue({
      store: supabaseQueueStore(),
      send: sendMailDetailed,
      alert,
      log: (message, payload) => logError('email', message, payload),
      now: () => new Date(),
    });
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    // Ошибка БД: письма остаются в pending/sending и будут подобраны следующим вызовом (releaseStale).
    const message = maskPii(e instanceof Error ? e.message : String(e));
    await logError('email', `send-emails: ${message}`);
    return NextResponse.json({ ok: false, sent: 0, error: 'queue_error' }, { status: 500 });
  }
}
