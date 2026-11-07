// middleware.ts — Edge: лицензия, кастомные домены, проверка Origin, X-Robots-Tag (ТЗ §3.4, §5.9, §17.4).
// Только Edge-совместимые операции: host, cookie, path. Никаких запросов к БД и self-fetch.
// Статические security headers (CSP, HSTS, XFO, nosniff, Referrer, Permissions) — в next.config.mjs.
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { isMainHost, normalizeHost } from './общие/lib/site';
import {
  DOMAIN_MAP_COOKIE, DOMAIN_MAP_MARKER, RESOLVE_HOST_HEADER, RESOLVE_NEXT_HEADER, RESOLVE_RETRY_HEADER, verifyDomainMap,
} from './общие/lib/domain-map';
import { LICENSE_COOKIE, pingLicense, type LicenseStatus } from './общие/lib/license-client';

const NOINDEX = 'noindex, nofollow';
const LICENSE_TTL_MS = 86_400_000;
// Сервер лицензий не ответил ('unknown') — повторяем через час, а не через сутки.
const LICENSE_RETRY_MS = 3_600_000;
const LICENSE_COOKIE_MAX_AGE = 86_400;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BLOCKED_PATH = '/blocked';

// ---------- Лицензия ----------
// Статус хранится в памяти инстанса Edge и обновляется в фоне (waitUntil) не чаще раза в сутки:
// ответ посетителю не ждёт внешний сервер лицензий. Сбой сети → 'unknown' → сайт не блокируется.
// Cookie license_status=blocked (ТЗ §3.4 п.6) блокирует, но разблокировать сайт подделкой cookie нельзя.
let license_state: { status: LicenseStatus; checked_at: number } | null = null;
let license_refreshing = false;

function licenseTtl(status: LicenseStatus): number {
  return status === 'unknown' ? LICENSE_RETRY_MS : LICENSE_TTL_MS;
}

function refreshLicense(event: NextFetchEvent, host: string): void {
  const due = !license_state || Date.now() - license_state.checked_at >= licenseTtl(license_state.status);
  if (!due || license_refreshing) return;
  license_refreshing = true;
  const version = process.env.APP_VERSION ?? '0.1.0';
  event.waitUntil(
    pingLicense(host, version)
      .then((status) => {
        license_state = { status, checked_at: Date.now() };
      })
      .finally(() => {
        license_refreshing = false;
      }),
  );
}

function isLicenseExempt(path: string): boolean {
  return path === BLOCKED_PATH || path.startsWith('/_next') || path.startsWith('/api/');
}

// true → сайт заблокирован. Без LICENSE_ID (наш основной деплой) проверка отключена.
function licenseBlocked(req: NextRequest, event: NextFetchEvent, host: string): boolean {
  if (!process.env.LICENSE_ID || isLicenseExempt(req.nextUrl.pathname)) return false;
  refreshLicense(event, host);
  if (license_state?.status === 'blocked') return true;
  const cookie_status = (req.cookies.get(LICENSE_COOKIE)?.value ?? '').split('|')[0];
  // Свежий ответ сервера «не blocked» важнее старой cookie. 'unknown' (сеть недоступна) ответом не считается.
  const server_answered = license_state !== null && license_state.status !== 'unknown';
  return cookie_status === 'blocked' && !server_answered;
}

function blockedResponse(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = BLOCKED_PATH;
  url.search = '';
  const res = NextResponse.rewrite(url);
  res.headers.set('X-Robots-Tag', NOINDEX);
  res.cookies.set(LICENSE_COOKIE, `blocked|${new Date().toISOString()}`, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: LICENSE_COOKIE_MAX_AGE,
  });
  return res;
}

// ---------- Origin (ТЗ §5.9, §17.4) ----------
// Браузер всегда шлёт Origin в POST/PUT/PATCH/DELETE. Чужой Origin → 403.
// Нет Origin → запрос не из браузера (Telegram webhook, сервер лицензий, cron) — пропускаем:
// такие маршруты защищены собственными секретами.
function isForeignOrigin(req: NextRequest, host: string): boolean {
  if (!MUTATING_METHODS.has(req.method)) return false;
  const origin = req.headers.get('origin');
  if (origin === null) return false;
  try {
    return normalizeHost(new URL(origin).host) !== host;
  } catch {
    return true;
  }
}

// ---------- Пути ----------
function isSystemPath(path: string): boolean {
  return path.startsWith('/_next') || path.startsWith('/api/') || /\.[a-z0-9]+$/i.test(path);
}

function isNoindexPath(path: string): boolean {
  return path.startsWith('/preview/')
    || path === '/panel' || path.startsWith('/panel/')
    || path === '/admin' || path.startsWith('/admin/')
    || path === '/dev' || path.startsWith('/dev/')
    || path === '/partner' || path.startsWith('/partner/')
    || /^\/[a-z]{1,4}\/[^/]+\/panel(\/|$)/.test(path);
}

function withNoindex(res: NextResponse, noindex: boolean): NextResponse {
  if (noindex) res.headers.set('X-Robots-Tag', NOINDEX);
  return res;
}

// ---------- Кастомный домен клиента (ТЗ §3.2, §40) ----------
async function customDomain(req: NextRequest, host: string): Promise<NextResponse> {
  const url = req.nextUrl.clone();
  const path = url.pathname;
  const has_marker = url.searchParams.has(DOMAIN_MAP_MARKER);
  const map = await verifyDomainMap(req.cookies.get(DOMAIN_MAP_COOKIE)?.value, host, process.env.ENCRYPTION_KEY);

  if (map) {
    // Первый заход после установки cookie: убираем маркер из адресной строки.
    if (has_marker) {
      url.searchParams.delete(DOMAIN_MAP_MARKER);
      return NextResponse.redirect(url, 307);
    }
    // Ссылки внутри сайта могут уже содержать /{prefix}/{slug} — не префиксуем повторно.
    const base = `/${map.prefix}/${map.slug}`;
    const already_prefixed = path === base || path.startsWith(`${base}/`);
    url.pathname = already_prefixed ? path : `${base}${path === '/' ? '' : path}`;
    return withNoindex(NextResponse.rewrite(url), map.status !== 'client' || isNoindexPath(url.pathname));
  }

  // Главная без cookie (поисковые боты, первый визит) — рендер по домену, без лишнего редиректа.
  if (path === '/') {
    url.pathname = '/domain-site/by-domain';
    url.search = '';
    url.searchParams.set('domain', host);
    return NextResponse.rewrite(url);
  }

  // Подпуть без cookie: rewrite (не fetch) в resolve-domain — один вызов функции, она ставит cookie и редиректит.
  // Данные — в заголовках запроса (см. RESOLVE_HOST_HEADER): значения клиента перезаписываются.
  url.searchParams.delete(DOMAIN_MAP_MARKER);
  const forward = new Headers(req.headers);
  forward.set(RESOLVE_HOST_HEADER, host);
  forward.set(RESOLVE_NEXT_HEADER, `${path}${url.search}`);
  if (has_marker) forward.set(RESOLVE_RETRY_HEADER, '1');
  else forward.delete(RESOLVE_RETRY_HEADER);
  url.pathname = '/api/resolve-domain';
  url.search = '';
  return withNoindex(NextResponse.rewrite(url, { request: { headers: forward } }), isNoindexPath(path));
}

export async function middleware(req: NextRequest, event: NextFetchEvent): Promise<NextResponse> {
  const host = normalizeHost(req.headers.get('host'));
  const path = req.nextUrl.pathname;

  if (isForeignOrigin(req, host)) {
    return NextResponse.json({ ok: false, reason: 'bad_origin' }, { status: 403 });
  }
  if (licenseBlocked(req, event, host)) return blockedResponse(req);

  if (!isMainHost(host) && !isSystemPath(path)) return customDomain(req, host);

  // Внутренний маршрут кастомных доменов не открывается напрямую на основном домене.
  if (path.startsWith('/domain-site')) return new NextResponse(null, { status: 404 });

  return withNoindex(NextResponse.next(), isNoindexPath(path) || path.startsWith('/api/'));
}

export const config = {
  // Статика, оптимизатор картинок, favicon и service worker не проходят через middleware.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js).*)'],
};
