// app/api/track/click/[token]/route.ts — клик по ссылке в письме (ТЗ §9.3): 302 на целевой адрес.
// Цель — ?url={base64url} (новые письма) или ?to={url} (письма до перехода на очередь).
// Защита от open redirect: редирект только на origin нашего сайта, иначе — на главную.
// Сбой БД или превышение лимита не мешают переходу (fail open).
import { NextResponse } from 'next/server';
import { decodeClickTarget, safeRedirectTarget } from '@/lib/outreach';
import { allowTrack, clientIp, recordEventSafe, tokenKind } from '@/lib/email-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUND = 302;

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const url = new URL(req.url);
  const raw = decodeClickTarget(url.searchParams.get('url')) ?? url.searchParams.get('to');
  const target = safeRedirectTarget(raw);
  if (tokenKind(params.token) !== 'invalid' && (await allowTrack('click', clientIp(req)))) {
    await recordEventSafe(params.token, 'clicked_at');
  }
  const res = NextResponse.redirect(target, FOUND);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
