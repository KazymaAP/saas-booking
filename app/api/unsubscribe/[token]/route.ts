// app/api/unsubscribe/[token]/route.ts — One-Click отписка (RFC 8058, ТЗ 4.0 §9.5, §15.7).
// Почтовый клиент (Gmail, Яндекс, Mail.ru) шлёт POST с телом «List-Unsubscribe=One-Click» без cookie и без Origin —
// поэтому проверка Origin здесь не применяется: защита — неподделываемый токен (AES-GCM) и лимит частоты.
// GET (клиент без поддержки RFC 8058 открыл URL из заголовка в браузере) → 303 на человекочитаемую страницу
// /unsubscribe/[token], которая оформляет отписку и показывает результат. Ответ API в JSON человеку не нужен.
import { NextResponse } from 'next/server';
import { hitRateLimit } from '@/lib/rate-limit';
import { getClientIp, logLegalError, maskEmail, parseUnsubscribeToken, unsubscribeEmail } from '@/lib/legal';
import { SITE_URL } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ТЗ (раздел «Безопасность» промта): 10 запросов в час с одного IP.
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 3_600;
const MAX_BODY_BYTES = 1_024;

type Context = { params: { token: string } };

const json = (body: Record<string, string | boolean>, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

export async function POST(req: Request, { params }: Context) {
  const ip = getClientIp(req.headers);
  // Тело по RFC 8058 — form-urlencoded «List-Unsubscribe=One-Click». Пустое тело тоже принимаем: часть клиентов
  // и кнопка на нашей странице его не шлют. Иное содержимое — не One-Click, отклоняем.
  const body = (await req.text().catch(() => '')).slice(0, MAX_BODY_BYTES).trim();
  if (body !== '' && !new URLSearchParams(body).has('List-Unsubscribe')) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  let allowed = true;
  try {
    allowed = await hitRateLimit(`unsubscribe:${ip}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
  } catch {
    // Лимитер недоступен — fail open (ТЗ §7.3): отписку нельзя блокировать из-за сбоя инфраструктуры.
    allowed = true;
  }
  if (!allowed) return json({ ok: false, reason: 'rate_limited' }, 429);

  const email = parseUnsubscribeToken(params.token);
  if (!email) return json({ ok: false, reason: 'invalid_token' }, 404);

  try {
    const result = await unsubscribeEmail(email, 'one_click');
    if (!result.ok) {
      await logLegalError('unsubscribe: ошибка записи', { email: maskEmail(email), source: 'one_click' });
      return json({ ok: false, reason: 'server' }, 500);
    }
    return json({ ok: true, already: result.already }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'неизвестная ошибка';
    await logLegalError(`unsubscribe: ${message}`, { email: maskEmail(email), source: 'one_click' });
    return json({ ok: false, reason: 'server' }, 500);
  }
}

export function GET(_req: Request, { params }: Context) {
  return NextResponse.redirect(`${SITE_URL}/unsubscribe/${encodeURIComponent(params.token)}`, 303);
}
