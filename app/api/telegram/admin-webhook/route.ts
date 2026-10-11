// app/api/telegram/admin-webhook/route.ts — webhook вашего бота (ТЗ §21, §54). Только для вас: чат из TELEGRAM_CHAT_ID.
// Команда /stats — короткая сводка. Остальное игнорируется.
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

async function reply(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => null);
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_ADMIN_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json().catch(() => null);
  const chatId = update?.message?.chat?.id;
  const text: string = (update?.message?.text ?? '').trim();
  // Чужим чатам не отвечаем
  if (!chatId || String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) return NextResponse.json({ ok: true });

  if (text.startsWith('/stats')) {
    const db = adminClient();
    const [{ count: total }, { count: clients }, { count: sent }] = await Promise.all([
      db.from('businesses').select('id', { count: 'exact', head: true }),
      db.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'client'),
      db.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
    ]);
    await reply(chatId, `Бизнесов: ${total ?? 0}\nКлиентов: ${clients ?? 0}\nОтправлено писем: ${sent ?? 0}`);
  }
  return NextResponse.json({ ok: true });
}
