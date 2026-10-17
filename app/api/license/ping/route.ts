// app/api/license/ping/route.ts — приём license ping от переданных клиентам копий (ТЗ 4.0 §14.6, §14.7).
// Ответ: { status: active | unverified | unknown | blocked, license_id, domain, nonce, issued_at }
// + заголовок X-License-Signature = HMAC-SHA256(тело ответа, ключ лицензии). Логика — lib/license-server.ts.
// Блокировка — только вручную в /panel/licenses. Здесь сервер максимум помечает unverified/unknown.
import { SIGNATURE_HEADER } from '@/lib/license-client';
import { clientIp, handlePing, rateLimitKey, supabaseLicenseStore, telegramAlerter } from '@/lib/license-server';
import { hitRateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const MAX_BODY_BYTES = 4_096; // ping — маленький JSON, всё крупнее отбрасываем
// Лимит на пару (лицензия, IP): ping идёт при первом визите каждого посетителя в сутки, у посещаемого сайта это
// сотни в час. Превышение безопасно — клиент получает 429 и остаётся в offline grace, а не блокируется.
const RATE_LIMIT_PER_HOUR = 1_200;
const RATE_WINDOW_S = 3_600;

function reply(body: string, status: number, signature: string | null): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (signature) headers[SIGNATURE_HEADER] = signature;
  return new Response(body, { status, headers });
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) return reply(JSON.stringify({ status: 'unknown', reason: 'too_large' }), 413, null);

  const ip = clientIp(req.headers);
  // Сбой rate limit (БД недоступна) не должен ронять ping: пропускаем запрос.
  const allowed = await hitRateLimit(rateLimitKey(raw, ip), RATE_LIMIT_PER_HOUR, RATE_WINDOW_S).catch(() => true);
  if (!allowed) return reply(JSON.stringify({ status: 'unknown', reason: 'rate_limit' }), 429, null);

  try {
    const r = await handlePing(
      { raw_body: raw, signature: req.headers.get(SIGNATURE_HEADER), ip, user_agent: req.headers.get('user-agent') },
      { store: supabaseLicenseStore(), alert: telegramAlerter, master_secret: process.env.LICENSE_HMAC_SECRET?.trim() || null },
    );
    return reply(r.body, r.http_status, r.signature);
  } catch (e) {
    // 503 без подписи: клиент воспримет как сбой и включит offline grace, а не блокировку.
    await logError('cron', 'license ping: ошибка сервера', { error: e instanceof Error ? e.message.slice(0, 200) : 'unknown' });
    return reply(JSON.stringify({ status: 'unknown', reason: 'server' }), 503, null);
  }
}
