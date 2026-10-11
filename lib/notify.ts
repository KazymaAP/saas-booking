// lib/notify.ts — уведомления бизнесу: Telegram (ТЗ §36) и email (ТЗ §5.5, §18).
// Telegram: бот бизнеса (TELEGRAM_BUSINESS_BOT_TOKEN) шлёт в businesses.telegram_chat_id.
// Email: отправка через ящик из email_accounts с ротацией по наименьшему sent_today (§5.5).
import nodemailer from 'nodemailer';
import { adminClient } from './supabase';
import { decryptSecret } from './crypto';
import type { EmailAccount } from './database.types';

export type BusinessEvent = 'new' | 'cancel' | 'reschedule';

const EVENT_TEXT: Record<BusinessEvent, string> = {
  new: '🎉 Новая запись',
  cancel: '❌ Запись отменена клиентом',
  reschedule: '🔄 Запись перенесена',
};

export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BUSINESS_BOT_TOKEN;
  if (!token || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.ok;
}

// Пишет событие бизнесу в Telegram (если подключён) и на email владельца.
export async function notifyBusinessEvent(businessId: string, event: BusinessEvent, bookingId: string): Promise<void> {
  const db = adminClient();
  const { data: business } = await db
    .from('businesses').select('name, telegram_chat_id, emails').eq('id', businessId).single();
  const { data: booking } = await db
    .from('bookings').select('scheduled_at, client_name, client_phone, service_id, services(name)').eq('id', bookingId).single();
  if (!business || !booking) return;

  const when = new Date(booking.scheduled_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const service = (booking as any).services?.name ?? 'Услуга';
  const text = `${EVENT_TEXT[event]}\n${business.name}\n${service}, ${when}\n${booking.client_name ?? ''} ${booking.client_phone ?? ''}`;

  if (business.telegram_chat_id) await sendTelegram(business.telegram_chat_id, text).catch(() => undefined);
  if (business.emails?.[0]) await sendMail({ to: business.emails[0], subject: EVENT_TEXT[event], text }).catch(() => undefined);
}

// Выбирает ящик с наименьшим sent_today среди активных, сбрасывает счётчик, если день сменился.
async function pickAccount(): Promise<EmailAccount | null> {
  const db = adminClient();
  const today = new Date().toISOString().slice(0, 10);
  await db.from('email_accounts').update({ sent_today: 0, last_reset: today }).or(`last_reset.is.null,last_reset.neq.${today}`);
  const { data } = await db
    .from('email_accounts').select('*').eq('active', true)
    .order('sent_today', { ascending: true }).limit(1);
  const acc = (data?.[0] ?? null) as EmailAccount | null;
  if (!acc || acc.sent_today >= acc.daily_limit) return null;
  return acc;
}

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  const acc = await pickAccount();
  if (!acc || !acc.smtp_pass_encrypted) return false;
  const transport = nodemailer.createTransport({
    host: acc.smtp_host ?? process.env.SMTP_HOST,
    port: acc.smtp_port ?? Number(process.env.SMTP_PORT ?? 465),
    secure: (acc.smtp_port ?? 465) === 465,
    auth: { user: acc.smtp_user ?? acc.email, pass: decryptSecret(acc.smtp_pass_encrypted) },
  });
  await transport.sendMail({ from: acc.email, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
  await adminClient().from('email_accounts').update({ sent_today: acc.sent_today + 1 }).eq('id', acc.id);
  return true;
}
