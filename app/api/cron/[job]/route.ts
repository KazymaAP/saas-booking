// app/api/cron/[job]/route.ts — остальные cron-задачи из ТЗ §26 одним обработчиком.
// Защита: Authorization: Bearer CRON_SECRET. Задачи send-emails, check-replies, booking-reminders — отдельные маршруты.
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { isCronAuthorized } from '@/lib/cron';
import { sendMail, sendTelegram } from '@/lib/notify';

export const runtime = 'nodejs';
export const maxDuration = 300;

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

type Handler = () => Promise<Record<string, unknown>>;

const JOBS: Record<string, Handler> = {
  // §26: неподтверждённые брони старше 24 ч — письмо владельцу
  'unconfirmed-reminder': async () => {
    const db = adminClient();
    const { data } = await db.from('bookings')
      .select('id, scheduled_at, client_name, businesses(name, emails, telegram_chat_id)')
      .eq('status', 'new').lt('created_at', ago(1)).gt('scheduled_at', new Date().toISOString()).limit(200);
    let n = 0;
    for (const b of (data ?? []) as any[]) {
      const text = `Бронь ждёт подтверждения: ${b.businesses?.name}, ${b.client_name}, ${new Date(b.scheduled_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;
      if (b.businesses?.emails?.[0]) await sendMail({ to: b.businesses.emails[0], subject: 'Бронь ждёт подтверждения', text }).catch(() => false);
      if (b.businesses?.telegram_chat_id) await sendTelegram(b.businesses.telegram_chat_id, text).catch(() => false);
      n++;
    }
    return { reminded: n };
  },

  // §25: молчуны — 30 и 60 дней повтор, 90 дней архив
  'follow-up': async () => {
    const db = adminClient();
    const { data } = await db.from('businesses').select('id, name, emails, status').eq('status', 'sent');
    let sent = 0, archived = 0;
    for (const b of data ?? []) {
      const { data: out } = await db.from('emails_outgoing').select('sent_at, opened_at').eq('business_id', b.id).order('sent_at', { ascending: false }).limit(3);
      const last = out?.[0];
      if (!last?.sent_at || last.opened_at) continue;
      const days = (Date.now() - new Date(last.sent_at).getTime()) / DAY;
      if (days >= 90) {
        await db.from('businesses').update({ status: 'archived' }).eq('id', b.id);
        archived++;
      } else if ((days >= 30 && out!.length === 1) || (days >= 60 && out!.length === 2)) {
        if (!b.emails?.[0]) continue;
        const text = `Напоминаем о демо-сайте онлайн-записи для ${b.name}. Ответьте, если интересно.`;
        const ok = await sendMail({ to: b.emails[0], subject: 'Напоминание: сайт онлайн-записи', text }).catch(() => false);
        if (ok) {
          await db.from('emails_outgoing').insert({ business_id: b.id, to_email: b.emails[0], subject: 'Напоминание', body_text: text, sent_at: new Date().toISOString(), status: 'sent' });
          sent++;
        }
      }
    }
    return { followups: sent, archived };
  },

  // §5.5: суточный сброс счётчиков писем
  'reset-email-limits': async () => {
    await adminClient().from('email_accounts').update({ sent_today: 0, last_reset: new Date().toISOString().slice(0, 10) }).gte('daily_limit', 0);
    return { ok: true };
  },

  // §5.9: напоминания об оплате подписки
  'subscription-reminders': async () => {
    const db = adminClient();
    const today = new Date().toISOString().slice(0, 10);
    const in3 = ahead(3).slice(0, 10);
    const { data } = await db.from('businesses').select('id, name, emails, subscription_until, subscription_active').eq('subscription_active', true).lte('subscription_until', in3);
    let n = 0;
    for (const b of data ?? []) {
      if (!b.emails?.[0] || !b.subscription_until) continue;
      const left = Math.round((new Date(b.subscription_until).getTime() - new Date(today).getTime()) / DAY);
      const text = left > 0 ? `Подписка для ${b.name} истекает через ${left} дн. Продлите, чтобы сайт продолжал работать.` : `Подписка для ${b.name} истекла сегодня.`;
      await sendMail({ to: b.emails[0], subject: 'Продление подписки', text }).catch(() => false);
      n++;
    }
    // §5.9: через 7 дней просрочки сайт отключается (заглушка), через 30 — архив
    await db.from('businesses').update({ subscription_active: false }).eq('subscription_active', true).lt('subscription_until', ago(7).slice(0, 10));
    await db.from('businesses').update({ status: 'archived' }).eq('status', 'client').lt('subscription_until', ago(30).slice(0, 10));
    return { reminders: n };
  },

  // §19: отказы — через 30 дней в архив (нужна refused_at из миграции 0002)
  'archive-refused': async () => {
    const { data } = await adminClient().from('businesses').update({ status: 'archived' }).eq('status', 'refused').lt('refused_at', ago(30)).select('id');
    return { archived: data?.length ?? 0 };
  },

  // §33: аудит хранится 1 год
  'cleanup-audit-log': async () => {
    const { data } = await adminClient().from('audit_log').delete().lt('created_at', ago(365)).select('id');
    return { deleted: data?.length ?? 0 };
  },

  // §35: JSON-выгрузка ключевых таблиц в приватный bucket backups (pg_dump недоступен на Vercel)
  backup: async () => {
    const db = adminClient();
    const stamp = new Date().toISOString().slice(0, 10);
    const tables = ['businesses', 'services', 'bookings', 'admin_users', 'outreach_log', 'emails_outgoing', 'licenses'];
    const out: Record<string, unknown> = {};
    for (const t of tables) {
      const { data } = await db.from(t).select('*').limit(100_000);
      out[t] = data;
    }
    const body = Buffer.from(JSON.stringify(out));
    const { error } = await db.storage.from('backups').upload(`backup-${stamp}.json`, body, { contentType: 'application/json', upsert: true });
    return error ? { ok: false, error: error.message } : { ok: true, bytes: body.length };
  },

  // §32: удаление аккаунтов через 30 дней (журнал рассылки и аудит сохраняются)
  'process-deletions': async () => {
    const { data } = await adminClient().from('businesses').delete().eq('status', 'pending_deletion').lt('deletion_scheduled_at', new Date().toISOString()).select('id');
    return { deleted: data?.length ?? 0 };
  },

  // Слоты не хранятся в БД: они считаются на лету (lib/availability.ts), чистить нечего.
  'cleanup-slots': async () => ({ ok: true, note: 'слоты не хранятся, очистка не требуется' }),

  // §3.4, §48: прототипы старше 90 дней — в архив, ещё через 30 — удаление (outreach_log сохраняется)
  'cleanup-prototypes': async () => {
    const db = adminClient();
    const { data: archived } = await db.from('businesses').update({ status: 'archived' }).eq('status', 'preview_ready').lt('created_at', ago(90)).select('id');
    const { data: deleted } = await db.from('businesses').delete().eq('status', 'archived').lt('created_at', ago(120)).select('id');
    return { archived: archived?.length ?? 0, deleted: deleted?.length ?? 0 };
  },

  // §5.9: передача кода — через 30 дней заглушка (subscription_active=false), через 7 дней после — transferred_out
  'process-transfers': async () => {
    const db = adminClient();
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = ago(7).slice(0, 10);
    const { data: stubbed } = await db.from('businesses').update({ subscription_active: false }).not('code_transferred_at', 'is', null).lt('support_until', today).eq('subscription_active', true).select('id');
    const { data: out } = await db.from('businesses').update({ status: 'transferred_out' }).not('code_transferred_at', 'is', null).lt('support_until', weekAgo).neq('status', 'transferred_out').select('id');
    return { stubbed: stubbed?.length ?? 0, transferred_out: out?.length ?? 0 };
  },

  // §52: проверка кастомных доменов через Vercel API
  'check-domains': async () => {
    const token = process.env.VERCEL_API_TOKEN;
    if (!token) return { ok: false, error: 'VERCEL_API_TOKEN не задан' };
    const db = adminClient();
    const { data } = await db.from('businesses').select('id, name, custom_domain').not('custom_domain', 'is', null);
    const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '';
    const problems: string[] = [];
    for (const b of data ?? []) {
      const res = await fetch(`https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${b.custom_domain}${team}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.verified === false) problems.push(b.custom_domain!);
      await db.from('businesses').update({ ssl_status: res.ok && j.verified ? 'active' : res.ok ? 'pending' : 'error' }).eq('id', b.id);
    }
    if (problems.length && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `⚠️ Домены не проверены: ${problems.join(', ')}` }),
      });
    }
    return { checked: data?.length ?? 0, problems };
  },
};

export async function GET(req: Request, { params }: { params: { job: string } }) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const handler = JOBS[params.job];
  if (!handler) return NextResponse.json({ ok: false, reason: 'unknown_job' }, { status: 404 });
  const result = await handler();
  return NextResponse.json({ ok: true, job: params.job, result });
}
