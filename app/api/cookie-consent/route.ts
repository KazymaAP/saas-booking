// app/api/cookie-consent/route.ts — запись согласия на cookie в журнал cookie_consents (ТЗ 4.0 §15.6, §4.44).
// Пишется только согласие (accepted=true): отказ не фиксируется — при отказе работают лишь технические cookie.
// IP и User-Agent хранятся только как SHA-256 с солью. Ошибка записи не мешает посетителю: 204 в любом случае,
// кроме явного злоупотребления (чужой Origin, мусор, превышение лимита).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { hitRateLimit } from '@/lib/rate-limit';
import { COOKIE_POLICY_VERSION, getClientIp, hashIdentifier, isTrustedOrigin } from '@/lib/legal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 20 записей в час с одного IP: хватает на несколько браузеров в одной сети, отсекает накрутку журнала.
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 3_600;
const MAX_BODY_BYTES = 1_024;

const BodySchema = z.object({
  accepted: z.literal(true),
  policy_version: z.literal(COOKIE_POLICY_VERSION),
}).strict();

const no_content = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  if (!isTrustedOrigin(req.headers.get('origin'), req.headers.get('host'))) {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });
  }
  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, reason: 'too_large' }, { status: 413 });

  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // Не JSON — ниже zod вернёт validation.
    json = null;
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'validation' }, { status: 400 });

  const ip = getClientIp(req.headers);
  try {
    if (!(await hitRateLimit(`cookie_consent:${ip}`, RATE_LIMIT, RATE_WINDOW_SECONDS))) {
      return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 });
    }
    await adminClient().from('cookie_consents').insert({
      ip_hash: hashIdentifier(ip),
      ua_hash: hashIdentifier(req.headers.get('user-agent') ?? ''),
      accepted: true,
      policy_version: parsed.data.policy_version,
    });
  } catch {
    // БД недоступна — согласие действует по localStorage; посетителю ошибку не показываем (ТЗ: «тихо, не блокировать»).
  }
  // Ошибка insert (например, таблицы ещё нет — миграция агента 1) возвращается в объекте, не бросается: тоже тихо.
  return no_content();
}
