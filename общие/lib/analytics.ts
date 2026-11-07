// lib/analytics.ts — собственная аналитика сайтов клиентов (ТЗ 4.0 §12.3, §4.40).
// Приватность по умолчанию: IP и User-Agent хэшируются SHA-256 с солью ANALYTICS_SALT (+ дата, ротация раз в сутки) и в открытом виде
// нигде не сохраняются и не логируются. session_id — случайный uuid v4 в host-only cookie, без PII.
// Хэширование через Web Crypto: модуль работает и в Node-рантайме, и в Edge.
import { adminClient } from './supabase';

// Whitelist событий. Синхронизирован с CHECK analytics_events_event_chk в 0009_analytics.sql.
export const ANALYTICS_EVENTS = [
  'pageview',
  'booking_open',
  'booking_submit',
  'phone_click',
  'map_open',
  'preview_view',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_SECONDS = 30 * 60;
export const TRACK_RATE_LIMIT = 1000;
export const TRACK_RATE_WINDOW_SECONDS = 60 * 60;
export const MAX_PATH_LENGTH = 512;
export const MAX_REFERRER_LENGTH = 255;
// Соль короче — слишком слабая защита от перебора IPv4 (всего 2^32 адресов).
export const MIN_SALT_LENGTH = 16;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// business_id — uuid любой версии (gen_random_uuid даёт v4, но импорт/legacy могут дать другие).
const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Сегменты пути, похожие на секреты (cancel_token, preview_token, tracking_token): uuid или длинный hex.
const SECRET_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i;
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|curl|wget|python-requests|httpclient|monitor/i;

export type AnalyticsEventRow = {
  business_id: string | null;
  event: AnalyticsEvent;
  path: string | null;
  ip_hash: string | null;
  ua_hash: string | null;
  referrer: string | null;
  session_id: string | null;
};

export type TrackContext = {
  ip: string | null;
  ua: string | null;
  session_id: string | null;
  // Хост сайта, на котором произошло событие: внутренние переходы не считаются реферером.
  host?: string | null;
  salt?: string | null;
  // Момент события для суточной соли; по умолчанию — сейчас (параметр нужен тестам).
  now?: Date;
};

export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === 'string' && (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

export function analyticsSalt(): string | null {
  const salt = process.env.ANALYTICS_SALT ?? '';
  return salt.length >= MIN_SALT_LENGTH ? salt : null;
}

// Суточная соль: SALT + дата по Москве. Хэш одного и того же IP/UA меняется каждые сутки, поэтому по дампу
// analytics_events нельзя связать визиты одного человека за разные дни (долгоживущий отпечаток), а «посетители
// за день» считаются как прежде. Rate limit (окно 1 час) на стыке суток просто начинает новый bucket.
const MSK_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });

export function dailySalt(salt: string, now: Date = new Date()): string {
  return `${salt}:${MSK_DAY.format(now)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Соль в конце: SHA-256(значение + соль), как в ТЗ. Без соли хэш не считается вовсе (иначе IP восстанавливается перебором).
async function saltedHash(value: string | null, salt: string | null): Promise<string | null> {
  const v = value?.trim();
  if (!v || !salt) return null;
  return sha256Hex(`${v}${salt}`);
}

export function hashIp(ip: string | null, salt: string | null = analyticsSalt()): Promise<string | null> {
  return saltedHash(ip, salt);
}

export function hashUa(ua: string | null, salt: string | null = analyticsSalt()): Promise<string | null> {
  return saltedHash(ua, salt);
}

export function isValidSessionId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

// Сессия: берём sid из cookie, если он валиден, иначе выдаём новый uuid v4.
// Продление (sliding TTL 30 мин) делает sessionCookie() на каждом событии.
export function getSessionId(cookieValue: string | null | undefined): { id: string; isNew: boolean } {
  if (isValidSessionId(cookieValue)) return { id: cookieValue, isNew: false };
  return { id: crypto.randomUUID(), isNew: true };
}

// Host-only cookie (без Domain): не делится между сайтами клиентов и кастомными доменами (ТЗ §5.8).
export function sessionCookie(id: string): string {
  return `${SESSION_COOKIE}=${id}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=') || null;
  }
  return null;
}

// Путь без query и hash (там токены превью и UTM-хвосты), секретные сегменты заменяются на :token.
export function normalizePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const pathOnly = raw.split(/[?#]/, 1)[0] ?? '';
  if (!pathOnly.startsWith('/')) return null;
  const cleaned = pathOnly
    .split('/')
    .map((seg) => (SECRET_SEGMENT.test(seg) ? ':token' : seg))
    .join('/');
  return cleaned.slice(0, MAX_PATH_LENGTH);
}

// Реферер — только origin внешнего сайта: путь и query чужого сайта могут содержать PII (поисковые запросы, email).
export function normalizeReferrer(raw: string | null | undefined, ownHost?: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (ownHost && url.host.toLowerCase() === ownHost.toLowerCase()) return null;
  return url.origin.slice(0, MAX_REFERRER_LENGTH);
}

// Do Not Track и Global Privacy Control: при любом из них событие не пишется.
export function isDoNotTrack(headers: Headers): boolean {
  return headers.get('dnt') === '1' || headers.get('sec-gpc') === '1';
}

// Защита от накруток: pixel шлёт браузер со страницы того же хоста (sendBeacon добавляет Origin).
// Чужой Origin — запрос со стороннего сайта/скрипта → событие отбрасываем. Нет Origin (старые браузеры) — пропускаем.
export function isCrossOrigin(headers: Headers): boolean {
  const origin = headers.get('origin');
  const host = headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() !== host.toLowerCase();
  } catch {
    return true;
  }
}

// Prefetch/prerender (Sec-Purpose: prefetch, Purpose: prefetch, X-Moz/X-Purpose: preview) — не просмотр человеком.
// sendBeacon такие заголовки не ставит, но запросы, прилетевшие через prefetch-прокси/сканеры ссылок, отсекаем.
export function isPrefetch(headers: Headers): boolean {
  const purpose = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''} ${headers.get('x-purpose') ?? ''} ${headers.get('x-moz') ?? ''}`;
  return /prefetch|prerender|preview/i.test(purpose);
}

export function isBot(ua: string | null): boolean {
  return !ua || BOT_UA.test(ua);
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || null;
}

// Чистая сборка строки для вставки: валидация события, нормализация, хэши. Сырые IP/UA дальше не идут.
export async function buildEventRow(
  business_id: string | null,
  event: string,
  path: string | null,
  referrer: string | null,
  ctx: TrackContext,
): Promise<AnalyticsEventRow | null> {
  if (!isAnalyticsEvent(event)) return null;
  if (business_id !== null && !UUID_ANY.test(business_id)) return null;
  const baseSalt = ctx.salt === undefined ? analyticsSalt() : ctx.salt;
  if (!baseSalt) return null;
  const salt = dailySalt(baseSalt, ctx.now);
  const [ip_hash, ua_hash] = await Promise.all([hashIp(ctx.ip, salt), hashUa(ctx.ua, salt)]);
  return {
    business_id,
    event,
    path: normalizePath(path),
    ip_hash,
    ua_hash,
    referrer: normalizeReferrer(referrer, ctx.host),
    session_id: isValidSessionId(ctx.session_id) ? ctx.session_id : null,
  };
}

// Вставка пачки строк одним запросом (батчинг). Ошибки не пробрасываются: трекинг не должен ломать сайт.
// Результат false — вызывающий решает, логировать ли (без содержимого строк).
export async function insertEvents(rows: AnalyticsEventRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  try {
    const { error } = await adminClient().from('analytics_events').insert(rows);
    return !error;
  } catch {
    return false;
  }
}

// Публичный API модуля по ТЗ: trackPageview(business_id, event, path, referrer) + контекст запроса.
export async function trackPageview(
  business_id: string | null,
  event: string,
  path: string | null,
  referrer: string | null,
  ctx: TrackContext,
): Promise<boolean> {
  const row = await buildEventRow(business_id, event, path, referrer, ctx);
  if (!row) return false;
  return insertEvents([row]);
}
