// app/api/telegram/webhook/route.ts — webhook бота бизнеса (ТЗ §36): /start BIZ-xxxxxx привязывает чат.
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { sendTelegram } from '@/lib/notify';

export const runtime = 'nodejs';

const CODE = /^BIZ-[0-9a-f]{6}$/;

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json().catch(() => null);
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text: string = (msg?.text ?? '').trim();
  if (!chatId || !text.startsWith('/start')) return NextResponse.json({ ok: true });

  const code = text.split(/\s+/)[1] ?? '';
  if (!CODE.test(code)) {
    await sendTelegram(String(chatId), 'Чтобы подключить уведомления, откройте кабинет и скопируйте код вида BIZ-xxxxxx.').catch(() => false);
    return NextResponse.json({ ok: true });
  }

  const db = adminClient();
  const { data: row } = await db.from('business_telegram_codes').select('code, business_id, used_at').eq('code', code).maybeSingle();
  if (!row || row.used_at) {
    await sendTelegram(String(chatId), 'Код не найден или уже использован. Создайте новый в кабинете.').catch(() => false);
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();
  await db.from('businesses').update({ telegram_chat_id: String(chatId), telegram_connected_at: now }).eq('id', row.business_id);
  await db.from('business_telegram_codes').update({ used_at: now }).eq('code', code);
  await sendTelegram(String(chatId), 'Готово. Уведомления о записях будут приходить сюда.').catch(() => false);
  return NextResponse.json({ ok: true });
}
