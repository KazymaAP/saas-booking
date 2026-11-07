// middleware.test.ts — маршрутизация кастомных доменов, Origin, лицензия, X-Robots-Tag. Без сети и БД.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, type NextFetchEvent } from 'next/server';
import type { LicenseStatus } from './license-client';

const pingLicenseMock = vi.fn(async (): Promise<LicenseStatus> => 'active');
vi.mock('./license-client', () => ({ LICENSE_COOKIE: 'license_status', pingLicense: pingLicenseMock }));

const SECRET = 'a'.repeat(64);
const { signDomainMap, nowSeconds } = await import('./domain-map');

type Init = { method?: string; headers?: Record<string, string>; cookies?: Record<string, string> };

function request(url: string, init: Init = {}): NextRequest {
  const parsed = new URL(url);
  const cookie = Object.entries(init.cookies ?? {}).map(([k, v]) => `${k}=${v}`).join('; ');
  const headers: Record<string, string> = { host: parsed.host, ...init.headers };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(url, { method: init.method ?? 'GET', headers });
}

const waitUntil = vi.fn((promise: Promise<unknown>) => promise);
// Middleware использует только waitUntil; полный NextFetchEvent в тесте не нужен.
const event = { waitUntil } as unknown as NextFetchEvent;

async function load() {
  vi.resetModules();
  return import('../../middleware');
}

// Заголовок, переданный middleware в запрос rewrite (NextResponse.rewrite(url, { request: { headers } })).
function forwardedHeader(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

function rewriteOf(res: Response): URL | null {
  const value = res.headers.get('x-middleware-rewrite');
  return value ? new URL(value) : null;
}

describe('middleware', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://zapishisya.ru');
    vi.stubEnv('ENCRYPTION_KEY', SECRET);
    vi.stubEnv('LICENSE_ID', '');
    pingLicenseMock.mockClear();
    waitUntil.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('основной домен: пропускает без rewrite и без fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { middleware } = await load();
    const res = await middleware(request('https://zapishisya.ru/t/tire'), event);
    expect(rewriteOf(res)).toBeNull();
    expect(res.headers.get('x-robots-tag')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('панели и прототипы — noindex', async () => {
    const { middleware } = await load();
    for (const path of ['/panel', '/panel/funnel', '/t/tire/panel', '/t/tire/panel/bookings', '/preview/abc']) {
      const res = await middleware(request(`https://zapishisya.ru${path}`), event);
      expect(res.headers.get('x-robots-tag'), path).toBe('noindex, nofollow');
    }
  });

  it('/domain-site напрямую на основном домене — 404', async () => {
    const { middleware } = await load();
    const res = await middleware(request('https://zapishisya.ru/domain-site/by-domain?domain=client.ru'), event);
    expect(res.status).toBe(404);
  });

  it('кастомный домен, главная без cookie → by-domain с параметром domain', async () => {
    const { middleware } = await load();
    const target = rewriteOf(await middleware(request('https://Client.ru/'), event));
    expect(target?.pathname).toBe('/domain-site/by-domain');
    expect(target?.searchParams.get('domain')).toBe('client.ru');
  });

  it('кастомный домен, подпуть без cookie → rewrite (не fetch) в resolve-domain', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { middleware } = await load();
    const res = await middleware(request('https://client.ru/panel/bookings?x=1'), event);
    const target = rewriteOf(res);
    expect(target?.pathname).toBe('/api/resolve-domain');
    expect(target?.search).toBe('');
    expect(forwardedHeader(res, 'x-resolve-host')).toBe('client.ru');
    expect(forwardedHeader(res, 'x-resolve-next')).toBe('/panel/bookings?x=1');
    expect(forwardedHeader(res, 'x-resolve-retry')).toBeNull();
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('кастомный домен с валидной cookie → /{prefix}/{slug}{path}', async () => {
    const signed = await signDomainMap({ host: 'client.ru', prefix: 't', slug: 'tire', status: 'client', exp: nowSeconds() + 60 }, SECRET);
    const { middleware } = await load();
    const res = await middleware(request('https://client.ru/panel', { cookies: { domain_map: signed ?? '' } }), event);
    expect(rewriteOf(res)?.pathname).toBe('/t/tire/panel');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');

    const page = await middleware(request('https://client.ru/booking/cancel/abc', { cookies: { domain_map: signed ?? '' } }), event);
    expect(rewriteOf(page)?.pathname).toBe('/t/tire/booking/cancel/abc');
    expect(page.headers.get('x-robots-tag')).toBeNull();
  });

  it('ссылка уже с /{prefix}/{slug} не префиксуется повторно', async () => {
    const signed = await signDomainMap({ host: 'client.ru', prefix: 't', slug: 'tire', status: 'client', exp: nowSeconds() + 60 }, SECRET);
    const { middleware } = await load();
    const res = await middleware(request('https://client.ru/t/tire/panel', { cookies: { domain_map: signed ?? '' } }), event);
    expect(rewriteOf(res)?.pathname).toBe('/t/tire/panel');
  });

  it('статус не client → noindex (ТЗ §3.4 п.3)', async () => {
    const signed = await signDomainMap({ host: 'client.ru', prefix: 't', slug: 'tire', status: 'preview_ready', exp: nowSeconds() + 60 }, SECRET);
    const { middleware } = await load();
    const res = await middleware(request('https://client.ru/services', { cookies: { domain_map: signed ?? '' } }), event);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('cookie чужого домена игнорируется', async () => {
    const signed = await signDomainMap({ host: 'other.ru', prefix: 't', slug: 'tire', status: 'client', exp: nowSeconds() + 60 }, SECRET);
    const { middleware } = await load();
    const res = await middleware(request('https://client.ru/panel', { cookies: { domain_map: signed ?? '' } }), event);
    expect(rewriteOf(res)?.pathname).toBe('/api/resolve-domain');
  });

  it('маркер __dm при валидной cookie → 307 на чистый адрес', async () => {
    const signed = await signDomainMap({ host: 'client.ru', prefix: 't', slug: 'tire', status: 'client', exp: nowSeconds() + 60 }, SECRET);
    const { middleware } = await load();
    const res = await middleware(request('https://client.ru/panel?__dm=1&a=2', { cookies: { domain_map: signed ?? '' } }), event);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').search).toBe('?a=2');
  });

  it('маркер __dm без cookie → retry=1 (resolve-domain ответит 400, без цикла)', async () => {
    const { middleware } = await load();
    const res = await middleware(request('https://client.ru/panel?__dm=1'), event);
    expect(forwardedHeader(res, 'x-resolve-retry')).toBe('1');
    expect(forwardedHeader(res, 'x-resolve-next')).toBe('/panel');
  });

  it('поддельные x-resolve-* от клиента перезаписываются middleware', async () => {
    const res = await (await load()).middleware(request('https://client.ru/services', {
      headers: { 'x-resolve-host': 'other.ru', 'x-resolve-next': '//evil.com', 'x-resolve-retry': '1' },
    }), event);
    expect(forwardedHeader(res, 'x-resolve-host')).toBe('client.ru');
    expect(forwardedHeader(res, 'x-resolve-next')).toBe('/services');
    expect(res.headers.get('x-middleware-override-headers')?.split(',')).not.toContain('x-resolve-retry');
  });

  it('статика и API на кастомном домене не переписываются', async () => {
    const { middleware } = await load();
    for (const path of ['/api/bookings', '/assets/studio.css', '/robots.txt']) {
      expect(rewriteOf(await middleware(request(`https://client.ru${path}`), event)), path).toBeNull();
    }
  });

  it('POST с чужим Origin → 403, со своим — пропускается, без Origin — пропускается', async () => {
    const { middleware } = await load();
    const foreign = await middleware(request('https://zapishisya.ru/api/bookings', { method: 'POST', headers: { origin: 'https://evil.example' } }), event);
    expect(foreign.status).toBe(403);
    const own = await middleware(request('https://zapishisya.ru/api/bookings', { method: 'POST', headers: { origin: 'https://zapishisya.ru' } }), event);
    expect(own.status).toBe(200);
    const server = await middleware(request('https://zapishisya.ru/api/telegram/webhook', { method: 'POST' }), event);
    expect(server.status).toBe(200);
    const broken = await middleware(request('https://zapishisya.ru/api/bookings', { method: 'DELETE', headers: { origin: 'null' } }), event);
    expect(broken.status).toBe(403);
  });

  it('GET с чужим Origin не блокируется', async () => {
    const { middleware } = await load();
    const res = await middleware(request('https://zapishisya.ru/t/tire', { headers: { origin: 'https://evil.example' } }), event);
    expect(res.status).toBe(200);
  });

  it('без LICENSE_ID лицензия не проверяется', async () => {
    const { middleware } = await load();
    await middleware(request('https://zapishisya.ru/', { cookies: { license_status: 'blocked|2026-01-01' } }), event);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('LICENSE_ID: ping в фоне через waitUntil, ответ не ждёт сервер лицензий', async () => {
    vi.stubEnv('LICENSE_ID', 'lic-1');
    const { middleware } = await load();
    const res = await middleware(request('https://zapishisya.ru/'), event);
    expect(res.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it('cookie license_status=blocked → /blocked (ТЗ §3.4 п.6)', async () => {
    vi.stubEnv('LICENSE_ID', 'lic-1');
    const { middleware } = await load();
    const res = await middleware(request('https://zapishisya.ru/t/tire', { cookies: { license_status: 'blocked|2026-01-01' } }), event);
    expect(rewriteOf(res)?.pathname).toBe('/blocked');
  });

  it('сервер недоступен (unknown) не снимает блокировку по cookie и повторяется через час', async () => {
    vi.stubEnv('LICENSE_ID', 'lic-1');
    pingLicenseMock.mockResolvedValue('unknown');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { middleware } = await load();
      await middleware(request('https://zapishisya.ru/'), event);
      await Promise.all(waitUntil.mock.calls.map(([p]) => p));
      const res = await middleware(request('https://zapishisya.ru/t/tire', { cookies: { license_status: 'blocked|2026-01-01' } }), event);
      expect(rewriteOf(res)?.pathname).toBe('/blocked');
      expect(pingLicenseMock).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 3_600_000);
      await middleware(request('https://zapishisya.ru/'), event);
      expect(pingLicenseMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      pingLicenseMock.mockResolvedValue('active');
    }
  });

  it('сервер ответил active → старая cookie blocked не блокирует', async () => {
    vi.stubEnv('LICENSE_ID', 'lic-1');
    const { middleware } = await load();
    await middleware(request('https://zapishisya.ru/'), event);
    await Promise.all(waitUntil.mock.calls.map(([p]) => p));
    const res = await middleware(request('https://zapishisya.ru/t/tire', { cookies: { license_status: 'blocked|2026-01-01' } }), event);
    expect(rewriteOf(res)).toBeNull();
  });

  it('сервер ответил blocked → блокировка без cookie; поддельная cookie active не помогает', async () => {
    vi.stubEnv('LICENSE_ID', 'lic-1');
    pingLicenseMock.mockResolvedValueOnce('blocked');
    const { middleware } = await load();
    await middleware(request('https://zapishisya.ru/'), event);
    await Promise.all(waitUntil.mock.calls.map(([p]) => p));
    const res = await middleware(request('https://zapishisya.ru/t/tire', { cookies: { license_status: 'active|2099-01-01' } }), event);
    expect(rewriteOf(res)?.pathname).toBe('/blocked');
  });
});
