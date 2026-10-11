// middleware.ts — маршрутизация, заголовки безопасности, проверка лицензии (ТЗ §3.3, §34, §5.8).
// Резолв бизнеса по slug/custom_domain и slug_history выполняется в страницах и route handlers.
import { NextResponse, type NextRequest } from 'next/server';
import { MAIN_HOSTS } from './lib/site';
import { LICENSE_COOKIE, pingDue, pingLicense, type LicenseStatus } from './lib/license-client';

// Основной домен, превью Vercel и localhost — не кастомные домены клиентов.
function isMainHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return (MAIN_HOSTS as readonly string[]).includes(h) || h === 'localhost' || h.endsWith('.vercel.app');
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
};

// Лицензия работает только если задан LICENSE_ID (то есть в переданной клиенту копии).
// Результат кешируется в cookie на сутки: формат значения status|ISO-дата.
async function licenseCheck(req: NextRequest): Promise<{ status: LicenseStatus; setCookie?: string } | null> {
  if (!process.env.LICENSE_ID) return null;
  const path = req.nextUrl.pathname;
  if (path === '/blocked' || path.startsWith('/_next') || path.startsWith('/api/')) return null;

  const cached = req.cookies.get(LICENSE_COOKIE)?.value ?? '';
  const [cachedStatus, checkedAt] = cached.split('|');
  if (cachedStatus && !pingDue(checkedAt)) return { status: cachedStatus as LicenseStatus };

  const domain = (req.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  const status = await pingLicense(domain, process.env.APP_VERSION ?? '0.1.0');
  return { status, setCookie: `${status}|${new Date().toISOString()}` };
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const url = req.nextUrl.clone();
  const path = url.pathname;

  // 0. Лицензия: блокировка переписывает на /blocked (§5.8)
  const lic = await licenseCheck(req);
  if (lic?.status === 'blocked' && path !== '/blocked') {
    url.pathname = '/blocked';
    return finish(NextResponse.rewrite(url), lic.setCookie);
  }

  // 1. Кастомный домен клиента: переписываем во внутренний путь, slug определит страница.
  if (!isMainHost(host)) {
    const isSystem = path.startsWith('/_next') || path.startsWith('/api') || path.includes('.');
    if (!isSystem && (path === '/panel' || path.startsWith('/panel/'))) {
      // §40: админка бизнеса на его домене — /panel → /{prefix}/{slug}/panel
      const r = await fetch(`${req.nextUrl.origin}/api/resolve-domain?host=${encodeURIComponent(host)}`).then((x) => x.json()).catch(() => null);
      if (r?.ok) {
        url.pathname = `/${r.prefix}/${r.slug}${path}`;
        return finish(NextResponse.rewrite(url), lic?.setCookie);
      }
    }
    if (!isSystem) {
      url.pathname = `/domain-site${path}`;
      url.searchParams.set('domain', host);
      return finish(NextResponse.rewrite(url), lic?.setCookie);
    }
  }

  // 2. Служебные пути не трогаем.
  if (path.startsWith('/_next') || path.startsWith('/api/cron')) {
    return finish(NextResponse.next(), lic?.setCookie);
  }

  // 3. Прототипы: /preview/{slug}?token=... — noindex, без токена 404 (проверка в странице).
  if (path.startsWith('/preview/')) {
    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return finish(res, lic?.setCookie);
  }

  return finish(NextResponse.next(), lic?.setCookie);
}

function finish(res: NextResponse, setCookie?: string): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  if (setCookie) {
    res.cookies.set(LICENSE_COOKIE, setCookie, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 });
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
