// app/api/track/page/route.ts — приём событий аналитики с сайтов клиентов (ТЗ 4.0 §12.3).
// Клиент шлёт navigator.sendBeacon (POST, text/plain — без CORS-preflight). Ответ всегда без тела.
// 204 — принято или молча отброшено (DNT, prefetch, бот, чужой Origin, нет соли); 400 — невалидный JSON/схема; 413 — слишком большое тело;
// 429 — превышен лимит 1000 событий/час/IP. Ошибки хранилища не ломают сайт: fail open, событие теряется тихо.
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import {
  ANALYTICS_EVENTS,
  SESSION_COOKIE,
  TRACK_RATE_LIMIT,
  TRACK_RATE_WINDOW_SECONDS,
  MAX_PATH_LENGTH,
  analyticsSalt,
  buildEventRow,
  clientIp,
  dailySalt,
  getSessionId,
  hashIp,
  insertEvents,
  isBot,
  isCrossOrigin,
  isDoNotTrack,
  isPrefetch,
  readCookie,
  sessionCookie,
  type AnalyticsEventRow,
} from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_BATCH = 20;
// Кэш существующих бизнесов на инстанс: не ходим в БД на каждое событие, но и не пишем чужие/выдуманные id.
const BUSINESS_CACHE_TTL_MS = 5 * 60 * 1000;
const BUSINESS_CACHE_MAX = 2000;

const EventSchema = z.object({
  business_id: z.string().uuid().nullable().optional(),
  event: z.enum(ANALYTICS_EVENTS),
  path: z.string().max(MAX_PATH_LENGTH * 4).nullable().optional(),
  referrer: z.string().max(2048).nullable().optional(),
});
const BodySchema = z.union([
  EventSchema,
  z.object({ events: z.array(EventSchema).min(1).max(MAX_BATCH) }),
]);
type TrackEvent = z.infer<typeof EventSchema>;

const businessCache = new Map<string, { ok: boolean; at: number }>();

function empty(status: number, headers?: HeadersInit): Response {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

// Существует ли бизнес с таким id. Ошибка БД → считаем существующим (fail open), CHECK в таблице всё равно защищает.
async function businessExists(id: string): Promise<boolean> {
  const cached = businessCache.get(id);
  if (cached && Date.now() - cached.at < BUSINESS_CACHE_TTL_MS) return cached.ok;
  let ok = true;
  try {
    const { data, error } = await adminClient().from('businesses').select('id').eq('id', id).maybeSingle();
    ok = error ? true : Boolean(data);
  } catch {
    ok = true;
  }
  if (businessCache.size >= BUSINESS_CACHE_MAX) businessCache.clear();
  businessCache.set(id, { ok, at: Date.now() });
  return ok;
}

// Rate limit по хэшу IP: сырой IP не попадает даже в rate_limits. Один атомарный upsert (analytics_rate_hit, 0009)
// вместо двух запросов hitRateLimit: без гонки при параллельных beacon и вдвое меньше нагрузки на БД.
// Сбой хранилища лимитов (ошибка RPC или сеть) → пропускаем (fail open): трекинг не должен ломать сайт.
async function withinRateLimit(ipHash: string | null): Promise<boolean> {
  if (!ipHash) return true;
  try {
    const { data, error } = await adminClient().rpc('analytics_rate_hit', {
      p_bucket: `track:${ipHash}`,
      p_limit: TRACK_RATE_LIMIT,
      p_window_seconds: TRACK_RATE_WINDOW_SECONDS,
    });
    return error ? true : data !== false;
  } catch {
    return true;
  }
}

// Чтение тела с жёстким лимитом в БАЙТАХ: без Content-Length (chunked) req.text() прочитал бы тело целиком,
// а text.length считает UTF-16-символы (кириллица в path — 2 байта на символ). Превышение → 'too_large'.
async function readBodyCapped(req: Request): Promise<string | 'too_large' | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return 'too_large';
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseEvents(text: string): TrackEvent[] | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return null;
  return 'events' in parsed.data ? parsed.data.events : [parsed.data];
}

async function buildRows(events: TrackEvent[], req: Request, sessionId: string, salt: string): Promise<AnalyticsEventRow[]> {
  const ctx = {
    ip: clientIp(req.headers),
    ua: req.headers.get('user-agent'),
    session_id: sessionId,
    host: req.headers.get('host'),
    salt,
  };
  const rows: AnalyticsEventRow[] = [];
  for (const e of events) {
    const businessId = e.business_id ?? null;
    if (businessId && !(await businessExists(businessId))) continue;
    const row = await buildEventRow(businessId, e.event, e.path ?? null, e.referrer ?? null, ctx);
    if (row) rows.push(row);
  }
  return rows;
}

export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return empty(413);

  // Приватность раньше всего: DNT/GPC, боты и чужой Origin — ничего не читаем, cookie не ставим.
  const ua = req.headers.get('user-agent');
  if (isDoNotTrack(req.headers) || isPrefetch(req.headers) || isBot(ua) || isCrossOrigin(req.headers)) return empty(204);

  const text = await readBodyCapped(req);
  if (text === 'too_large') return empty(413);
  const events = text ? parseEvents(text) : null;
  if (!events) return empty(400);

  const salt = analyticsSalt();
  if (!salt) return empty(204);

  const ipHash = await hashIp(clientIp(req.headers), dailySalt(salt));
  if (!(await withinRateLimit(ipHash))) return empty(429, { 'Retry-After': String(TRACK_RATE_WINDOW_SECONDS) });

  const session = getSessionId(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
  const rows = await buildRows(events, req, session.id, salt);
  await insertEvents(rows);

  // Единственная cookie — sid; продлеваем на каждом событии (скользящие 30 минут).
  return empty(204, { 'Set-Cookie': sessionCookie(session.id) });
}
