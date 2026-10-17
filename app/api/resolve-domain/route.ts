// app/api/resolve-domain/route.ts — кастомный домен → prefix/slug бизнеса (ТЗ §3.3, §40).
// Два режима:
//  1) JSON: GET /api/resolve-domain?host=клиент.ру → { ok, host, prefix, slug, status }. Кэш 60 с.
//  2) Redirect: middleware переписывает сюда подпуть кастомного домена, host/next/retry — в заголовках x-resolve-*.
//     Ставим подписанную cookie domain_map и 307 на тот же адрес — дальше middleware работает без БД.
import { NextResponse } from 'next/server';
import { findBusinessByDomain, type CustomDomainBusiness } from '@/lib/custom-domain';
import { hitRateLimit } from '@/lib/rate-limit';
import { normalizeHost, SITE_URL } from '@/lib/site';
import {
  DOMAIN_MAP_COOKIE, DOMAIN_MAP_MARKER, DOMAIN_MAP_TTL_SECONDS, RESOLVE_HOST_HEADER, RESOLVE_NEXT_HEADER,
  RESOLVE_RETRY_HEADER, nowSeconds, signDomainMap,
} from '@/lib/domain-map';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_SECONDS = 60;
// Защита от перебора доменов: 60 запросов в минуту с одного IP.
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;
const MAX_NEXT_LENGTH = 2048;

export type ResolvedDomain = CustomDomainBusiness;

// Кэш в памяти инстанса: повторные запросы к тому же домену не ходят в БД 60 секунд.
// Отрицательный результат тоже кэшируется — перебор несуществующих доменов не нагружает БД.
const memory_cache = new Map<string, { value: ResolvedDomain | null; expires: number }>();
const MEMORY_CACHE_LIMIT = 1000;
const MS_IN_SECOND = 1000;

function fromMemory(host: string): { value: ResolvedDomain | null } | null {
  const hit = memory_cache.get(host);
  return hit && hit.expires > Date.now() ? { value: hit.value } : null;
}

async function lookup(host: string): Promise<ResolvedDomain | null> {
  const value = await findBusinessByDomain(host);

  // Map хранит порядок вставки: при переполнении вытесняем самую старую запись, а не весь кэш.
  memory_cache.delete(host);
  if (memory_cache.size >= MEMORY_CACHE_LIMIT) {
    const oldest = memory_cache.keys().next();
    if (!oldest.done) memory_cache.delete(oldest.value);
  }
  memory_cache.set(host, { value, expires: Date.now() + CACHE_SECONDS * MS_IN_SECOND });
  return value;
}

// x-real-ip ставит Vercel по TCP-соединению; x-forwarded-for — запасной вариант (локально, за другим прокси).
function clientIp(req: Request): string {
  return req.headers.get('x-real-ip')?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

// Лимит в Postgres (lib/rate-limit). БД недоступна → не блокируем (ТЗ §17.5: fail open); lookup затем ответит 503.
async function withinRateLimit(req: Request): Promise<boolean> {
  try {
    return await hitRateLimit(`resolve-domain:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
  } catch {
    return true;
  }
}

// next — только относительный путь того же сайта (защита от open redirect: //evil.com, /\evil.com).
function safeNext(raw: string | null): string | null {
  if (!raw || raw.length > MAX_NEXT_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

function json(body: Record<string, unknown>, status: number, cache: boolean): NextResponse {
  const headers = { 'Cache-Control': cache ? `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}` : 'no-store' };
  return NextResponse.json(body, { status, headers });
}

async function redirectWithCookie(resolved: ResolvedDomain, next: string, retry: boolean): Promise<NextResponse> {
  // Маркер уже был, а cookie снова нет — браузер не принимает cookie. Без маркера был бы бесконечный цикл.
  if (retry) return new NextResponse('Включите cookie в браузере, чтобы открыть эту страницу.', { status: 400 });

  const exp = nowSeconds() + DOMAIN_MAP_TTL_SECONDS;
  const signed = await signDomainMap({ ...resolved, exp }, process.env.ENCRYPTION_KEY);
  const target = new URL(next, `https://${resolved.host}`);

  // Нет ключа подписи — открываем ту же страницу на основном домене (работает, но без кастомного адреса).
  if (!signed) return NextResponse.redirect(`${SITE_URL}/${resolved.prefix}/${resolved.slug}${target.pathname}${target.search}`, 307);

  target.searchParams.set(DOMAIN_MAP_MARKER, '1');
  const res = NextResponse.redirect(target, 307);
  res.headers.set('Cache-Control', 'no-store');
  res.cookies.set(DOMAIN_MAP_COOKIE, signed, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: DOMAIN_MAP_TTL_SECONDS,
  });
  return res;
}

// Параметры: из заголовков middleware (redirect-режим) или из query (JSON-режим).
// Подделка заголовков клиентом ничего не даёт сверх query: next проверяется safeNext,
// а cookie чужого хоста middleware отвергает (map.host !== host).
type ResolveParams = { host: string; next: string | null; retry: boolean };

function readParams(req: Request): ResolveParams {
  const query = new URL(req.url).searchParams;
  return {
    host: normalizeHost(req.headers.get(RESOLVE_HOST_HEADER) ?? query.get('host')),
    next: req.headers.get(RESOLVE_NEXT_HEADER) ?? query.get('next'),
    retry: (req.headers.get(RESOLVE_RETRY_HEADER) ?? query.get('retry')) === '1',
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const { host, next: next_raw, retry } = readParams(req);
  if (!host) return json({ ok: false, reason: 'bad_host' }, 400, false);

  // Попадание в кэш отвечает без БД; лимит считается только для промахов — именно они нагружают базу при переборе.
  let resolved = fromMemory(host)?.value;
  if (resolved === undefined) {
    if (!(await withinRateLimit(req))) {
      return json({ ok: false, reason: 'rate_limited' }, 429, false);
    }
    try {
      resolved = await lookup(host);
    } catch {
      return json({ ok: false, reason: 'unavailable' }, 503, false);
    }
  }

  const has_next = next_raw !== null;
  if (!resolved) return has_next ? new NextResponse('Not found', { status: 404 }) : json({ ok: false }, 404, true);

  if (has_next) {
    const next = safeNext(next_raw);
    if (!next) return json({ ok: false, reason: 'bad_next' }, 400, false);
    return redirectWithCookie(resolved, next, retry);
  }
  return json({ ok: true, ...resolved }, 200, true);
}
