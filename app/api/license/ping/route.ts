// app/api/license/ping/route.ts — проверка лицензии клиентского кода (ТЗ §5.8).
// Ответ: active | unverified | unknown | blocked. Блокировка — только вручную в /panel/licenses (§5.8).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { sendTelegram } from '@/lib/notify';

export const runtime = 'nodejs';

const Body = z.object({
  license_id: z.string().uuid(),
  domain: z.string().trim().min(3).max(253).toLowerCase(),
  version: z.string().trim().max(40).default('unknown'),
});

async function alertOwner(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) await sendTelegram(chat, text).catch(() => false);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ status: 'unknown' }, { status: 400 });
  const { license_id, domain, version } = parsed.data;
  const db = adminClient();

  const { data: lic } = await db.from('licenses').select('*').eq('license_id', license_id).maybeSingle();

  let status: 'active' | 'unverified' | 'unknown' | 'blocked';
  if (!lic) {
    status = 'unknown';
    await alertOwner(`🚨 Неизвестный запуск: лицензия ${license_id} на домене ${domain}`);
  } else if (lic.revoked) {
    status = 'blocked';
  } else if (lic.domain === domain || (lic.allowed_domains ?? []).includes(domain)) {
    status = 'active';
  } else {
    status = 'unverified';
    await alertOwner(`⚠️ Запуск на другом домене: ${domain} (лицензия ${license_id})`);
  }

  await db.from('license_pings').insert({
    license_id: lic ? license_id : null,
    domain,
    version,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
    user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    status,
  });

  return NextResponse.json({ status });
}
