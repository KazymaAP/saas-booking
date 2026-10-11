// app/api/cron/booking-reminders/route.ts — напоминания клиентам за 24 ч и 2 ч (ТЗ §18, §26: раз в час).
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { isCronAuthorized } from '@/lib/cron';
import { sendMail, sendTelegram } from '@/lib/notify';

export const runtime = 'nodejs';

const WINDOWS = [
  { key: 'reminder_24h_sent_at' as const, hours: 24 },
  { key: 'reminder_2h_sent_at' as const, hours: 2 },
];

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const db = adminClient();
  let sent = 0;

  for (const w of WINDOWS) {
    const from = new Date(Date.now() + (w.hours - 1) * 3_600_000).toISOString();
    const to = new Date(Date.now() + w.hours * 3_600_000).toISOString();

    const { data: rows } = await db
      .from('bookings')
      .select('id, scheduled_at, client_name, client_email, client_telegram, businesses(name, address, telegram_chat_id), services(name)')
      .in('status', ['new', 'confirmed'])
      .is(w.key, null)
      .gte('scheduled_at', from)
      .lt('scheduled_at', to);

    for (const b of (rows ?? []) as any[]) {
      const when = new Date(b.scheduled_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      const text = `Напоминаем: ${b.services?.name ?? 'запись'} в ${b.businesses?.name ?? ''}, ${when}. ${b.businesses?.address ?? ''}`;

      if (b.client_email) await sendMail({ to: b.client_email, subject: 'Напоминание о записи', text }).catch(() => false);
      if (w.hours === 24 && b.businesses?.telegram_chat_id) {
        // Клиентский Telegram-канал не подключён в MVP: уведомляем бизнес, §18 упоминает TG клиенту только при наличии chat_id.
        await sendTelegram(b.businesses.telegram_chat_id, `Скоро запись: ${text}`).catch(() => false);
      }

      await db.from('bookings').update({ [w.key]: new Date().toISOString() }).eq('id', b.id);
      sent++;
    }
  }

  return NextResponse.json({ ok: true, sent });
}
