// app/api/track/open/[token]/route.ts — пиксель открытия письма (ТЗ §9.3).
// Ответ всегда 204 без тела, даже для неизвестного токена или при сбое БД (fail open):
// почтовый клиент не должен видеть ошибку, а перебор токенов ничего не сообщает.
// Rate limit 1000/час/IP: сверх лимита событие не пишется, ответ тот же.
import { allowTrack, clientIp, recordEventSafe, tokenKind } from '@/lib/email-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_CONTENT = 204;
const HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (tokenKind(params.token) !== 'invalid' && (await allowTrack('open', clientIp(req)))) {
    await recordEventSafe(params.token, 'opened_at');
  }
  return new Response(null, { status: NO_CONTENT, headers: HEADERS });
}
