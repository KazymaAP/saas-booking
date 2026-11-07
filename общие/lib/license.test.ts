// lib/license.test.ts — тесты клиента и сервера лицензии (HMAC, offline grace, cookie, fail-safe, алерты).
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Моки для теста route handler: БД и Telegram подменяются памятью (остальная логика — настоящая).
const routeEnv = vi.hoisted(() => ({
  rows: [] as { license_id: string; domain: string | null; allowed_domains: string[] | null; revoked: boolean }[],
  pings: [] as { status: string; domain: string }[],
  alerts: [] as string[],
  rate_ok: true,
  fail_db: false,
}));
vi.mock('./rate-limit', () => ({ hitRateLimit: async () => routeEnv.rate_ok }));
vi.mock('./log', () => ({ logError: async () => undefined }));
vi.mock('./license-server', async (importOriginal) => {
  const real = await importOriginal<typeof import('./license-server')>();
  return {
    ...real,
    telegramAlerter: async (t: string) => { routeEnv.alerts.push(t); },
    supabaseLicenseStore: () => ({
      async findLicense(id: string) {
        if (routeEnv.fail_db) throw new Error('db down');
        return routeEnv.rows.find((r) => r.license_id === id) ?? null;
      },
      async recordPing(row: { status: string; domain: string }) { routeEnv.pings.push(row); },
      async hasRecentSignal() { return false; },
      async bindDomain() { return undefined; },
    }),
  };
});
import {
  OFFLINE_GRACE_MS,
  SIGNATURE_HEADER,
  checkLicense,
  decodeLicenseCookie,
  encodeLicenseCookie,
  hmacSign,
  hmacVerify,
  pingDue,
  resolveAfterFailure,
  resolveAfterSuccess,
  safeEqualHex,
  sendPing,
  type LicenseConfig,
  type LicenseStatus,
} from './license-client';
import {
  decideStatus,
  deriveLicenseKey,
  handlePing,
  isDomainAllowed,
  maskDomain,
  rateLimitKey,
  type LicenseRow,
  type LicenseStore,
  type PingRow,
} from './license-server';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const CFG: LicenseConfig = { license_id: '11111111-1111-4111-8111-111111111111', server_url: 'https://lic.example', secret: SECRET };
const NOW = new Date('2026-10-15T12:00:00.000Z');
const DAY = 86_400_000;

type Captured = { url: string; body: string; signature: string | null };

// Фейковый сервер лицензий: отвечает подписанным JSON, эхо nonce/domain из запроса.
function fakeServer(status: LicenseStatus, opts: { secret?: string; tamper?: (body: Record<string, string>) => void; http?: number } = {}) {
  const calls: Captured[] = [];
  const impl = async (url: string, init: RequestInit): Promise<Response> => {
    const body = String(init.body);
    const headers = new Headers(init.headers);
    calls.push({ url, body, signature: headers.get(SIGNATURE_HEADER) });
    const req = JSON.parse(body) as Record<string, string>;
    const reply: Record<string, string> = { status, license_id: req.license_id, domain: req.domain, nonce: req.nonce, issued_at: NOW.toISOString() };
    opts.tamper?.(reply);
    const text = JSON.stringify(reply);
    const sig = await hmacSign(opts.secret ?? SECRET, text);
    return new Response(text, { status: opts.http ?? 200, headers: { [SIGNATURE_HEADER]: sig } });
  };
  return { impl, calls };
}

const failingFetch = async (): Promise<Response> => {
  throw new TypeError('fetch failed');
};

describe('HMAC', () => {
  it('подпись детерминирована и проверяется', async () => {
    const sig = await hmacSign(SECRET, 'payload');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(await hmacVerify(SECRET, 'payload', sig)).toBe(true);
  });

  it('другой секрет, другие данные или мусор не проходят', async () => {
    const sig = await hmacSign(SECRET, 'payload');
    expect(await hmacVerify('other', 'payload', sig)).toBe(false);
    expect(await hmacVerify(SECRET, 'payload2', sig)).toBe(false);
    expect(await hmacVerify(SECRET, 'payload', null)).toBe(false);
    expect(await hmacVerify(SECRET, 'payload', 'zz')).toBe(false);
  });

  it('safeEqualHex сравнивает длину и содержимое', () => {
    expect(safeEqualHex('ab', 'ab')).toBe(true);
    expect(safeEqualHex('ab', 'ac')).toBe(false);
    expect(safeEqualHex('ab', 'abc')).toBe(false);
  });
});

describe('sendPing', () => {
  it('успех: запрос подписан, ответ проверен', async () => {
    const srv = fakeServer('active');
    const out = await sendPing(CFG, 'Client.RU:443', '1.0.0', srv.impl);
    expect(out).toEqual({ ok: true, status: 'active' });
    expect(srv.calls[0].url).toBe('https://lic.example/api/license/ping');
    expect(await hmacVerify(SECRET, srv.calls[0].body, srv.calls[0].signature)).toBe(true);
    expect(JSON.parse(srv.calls[0].body).domain).toBe('client.ru');
  });

  it('blocked от сервера доходит до клиента', async () => {
    expect(await sendPing(CFG, 'client.ru', '1', fakeServer('blocked').impl)).toEqual({ ok: true, status: 'blocked' });
  });

  it('сеть упала → network, не blocked', async () => {
    expect(await sendPing(CFG, 'client.ru', '1', failingFetch)).toEqual({ ok: false, reason: 'network' });
  });

  it('5xx → http', async () => {
    expect(await sendPing(CFG, 'client.ru', '1', fakeServer('blocked', { http: 503 }).impl)).toEqual({ ok: false, reason: 'http' });
  });

  it('подпись чужим секретом → signature', async () => {
    const out = await sendPing(CFG, 'client.ru', '1', fakeServer('blocked', { secret: 'attacker' }).impl);
    expect(out).toEqual({ ok: false, reason: 'signature' });
  });

  it('повтор старого ответа (чужой nonce) → payload', async () => {
    const srv = fakeServer('active', { tamper: (r) => { r.nonce = 'old-nonce'; } });
    expect(await sendPing(CFG, 'client.ru', '1', srv.impl)).toEqual({ ok: false, reason: 'payload' });
  });

  it('ответ для другого домена → payload', async () => {
    const srv = fakeServer('active', { tamper: (r) => { r.domain = 'other.ru'; } });
    expect(await sendPing(CFG, 'client.ru', '1', srv.impl)).toEqual({ ok: false, reason: 'payload' });
  });
});

describe('offline grace', () => {
  const okState = resolveAfterSuccess('active', new Date(NOW.getTime() - 3 * DAY));

  it('в пределах 7 дней сохраняется последний подтверждённый статус', () => {
    const s = resolveAfterFailure(okState, NOW);
    expect(s.status).toBe('active');
    expect(s.source).toBe('grace');
    expect(s.last_ok_at).toBe(okState.last_ok_at);
  });

  it('после 7 дней → unknown (не blocked)', () => {
    const old = resolveAfterSuccess('active', new Date(NOW.getTime() - OFFLINE_GRACE_MS - 1000));
    const s = resolveAfterFailure(old, NOW);
    expect(s.status).toBe('unknown');
    expect(s.source).toBe('expired');
  });

  it('без истории → unknown', () => {
    expect(resolveAfterFailure(null, NOW).status).toBe('unknown');
  });

  it('прошлый blocked при сбое не продлевается (fail-safe)', () => {
    const blocked = resolveAfterSuccess('blocked', new Date(NOW.getTime() - DAY));
    expect(resolveAfterFailure(blocked, NOW).status).toBe('unknown');
  });

  it('last_ok_at из будущего не даёт бесконечный grace', () => {
    const future = resolveAfterSuccess('active', new Date(NOW.getTime() + 100 * DAY));
    expect(resolveAfterFailure(future, NOW).status).toBe('unknown');
  });
});

describe('pingDue', () => {
  it('нет даты или мусор → нужен ping', () => {
    expect(pingDue(undefined, NOW)).toBe(true);
    expect(pingDue('not-a-date', NOW)).toBe(true);
  });
  it('успешный ping меньше суток назад → не нужен', () => {
    expect(pingDue(new Date(NOW.getTime() - 23 * 3_600_000).toISOString(), NOW)).toBe(false);
  });
  it('сутки прошли → нужен', () => {
    expect(pingDue(new Date(NOW.getTime() - DAY).toISOString(), NOW)).toBe(true);
  });
  it('после сбоя повтор через час', () => {
    expect(pingDue(new Date(NOW.getTime() - 3_600_000).toISOString(), NOW, true)).toBe(true);
    expect(pingDue(new Date(NOW.getTime() - 1_800_000).toISOString(), NOW, true)).toBe(false);
  });
  it('дата из будущего → нужен ping', () => {
    expect(pingDue(new Date(NOW.getTime() + DAY).toISOString(), NOW)).toBe(true);
  });
});

describe('cookie', () => {
  it('круговая кодировка сохраняет состояние', async () => {
    const s = resolveAfterSuccess('unverified', NOW);
    const v = await encodeLicenseCookie(SECRET, s);
    expect(v.startsWith('unverified|')).toBe(true);
    expect(v).not.toContain(SECRET);
    const d = await decodeLicenseCookie(SECRET, v);
    expect(d).toMatchObject({ status: 'unverified', checked_at: s.checked_at, last_ok_at: s.last_ok_at, ok_status: 'unverified' });
  });

  it('подделка статуса ломает подпись', async () => {
    const v = await encodeLicenseCookie(SECRET, resolveAfterSuccess('blocked', NOW));
    expect(await decodeLicenseCookie(SECRET, v.replace(/^blocked/, 'active'))).toBeNull();
  });

  it('старый неподписанный формат status|ISO не принимается', async () => {
    expect(await decodeLicenseCookie(SECRET, `active|${NOW.toISOString()}`)).toBeNull();
    expect(await decodeLicenseCookie(SECRET, undefined)).toBeNull();
  });
});

describe('checkLicense', () => {
  it('без конфигурации → null (основной сервис)', async () => {
    expect(await checkLicense({ domain: 'a.ru', version: '1', cookie: undefined, config: null })).toBeNull();
  });

  it('свежая cookie → без сетевого запроса', async () => {
    const cookie = await encodeLicenseCookie(SECRET, resolveAfterSuccess('active', new Date(NOW.getTime() - 3_600_000)));
    const srv = fakeServer('blocked');
    const r = await checkLicense({ domain: 'a.ru', version: '1', cookie, now: NOW, config: CFG, fetchImpl: srv.impl });
    expect(r?.state.status).toBe('active');
    expect(r?.cookie).toBeNull();
    expect(srv.calls).toHaveLength(0);
  });

  it('устаревшая cookie + сбой сети → grace', async () => {
    const cookie = await encodeLicenseCookie(SECRET, resolveAfterSuccess('active', new Date(NOW.getTime() - 2 * DAY)));
    const r = await checkLicense({ domain: 'a.ru', version: '1', cookie, now: NOW, config: CFG, fetchImpl: failingFetch });
    expect(r?.state).toMatchObject({ status: 'active', source: 'grace' });
    expect(r?.cookie).toMatch(/^active\|/);
  });

  it('устаревшая cookie + сервер blocked → blocked', async () => {
    const cookie = await encodeLicenseCookie(SECRET, resolveAfterSuccess('active', new Date(NOW.getTime() - 2 * DAY)));
    const r = await checkLicense({ domain: 'a.ru', version: '1', cookie, now: NOW, config: CFG, fetchImpl: fakeServer('blocked').impl });
    expect(r?.state).toMatchObject({ status: 'blocked', source: 'server' });
  });
});

// ---------- Сервер лицензий ----------


const MASTER = 'master-secret-for-tests-0123456789';
const LIC: LicenseRow = { license_id: CFG.license_id, domain: 'client.ru', allowed_domains: ['shop.client.ru'], revoked: false };

function memoryStore(rows: LicenseRow[]) {
  const pings: (PingRow & { at: string })[] = [];
  const bound: string[] = [];
  const store: LicenseStore = {
    async findLicense(id) {
      return rows.find((r) => r.license_id === id) ?? null;
    },
    async recordPing(row) {
      pings.push({ ...row, at: new Date().toISOString() });
    },
    async hasRecentSignal(id, domain, status, since) {
      return pings.some((p) => p.license_id === id && p.domain === domain && p.status === status && p.at >= since);
    },
    async bindDomain(id, domain) {
      bound.push(`${id}:${domain}`);
    },
  };
  return { store, pings, bound };
}

// Клиентский конфиг с производным ключом — так его получает клиент в transfer-файле.
async function clientCfg(): Promise<LicenseConfig> {
  return { ...CFG, secret: await deriveLicenseKey(MASTER, CFG.license_id) };
}

// Связка «настоящий клиент → настоящий сервер» без сети.
function loopback(store: LicenseStore, alerts: string[]) {
  return async (_url: string, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers);
    const r = await handlePing(
      { raw_body: String(init.body), signature: headers.get(SIGNATURE_HEADER), ip: '10.0.0.1', user_agent: 'vitest', now: new Date() },
      { store, alert: async (t) => { alerts.push(t); }, master_secret: MASTER },
    );
    return new Response(r.body, { status: r.http_status, headers: r.signature ? { [SIGNATURE_HEADER]: r.signature } : {} });
  };
}

describe('license-server: решение по статусу', () => {
  it('основной, дополнительный и www-домен → active', () => {
    expect(decideStatus(LIC, 'client.ru').status).toBe('active');
    expect(decideStatus(LIC, 'www.client.ru').status).toBe('active');
    expect(decideStatus(LIC, 'shop.client.ru').status).toBe('active');
    expect(isDomainAllowed(LIC, 'CLIENT.RU:443')).toBe(true);
  });
  it('чужой домен → unverified, не blocked', () => {
    expect(decideStatus(LIC, 'evil.ru').status).toBe('unverified');
  });
  it('revoked → blocked; нет лицензии → unknown', () => {
    expect(decideStatus({ ...LIC, revoked: true }, 'client.ru').status).toBe('blocked');
    expect(decideStatus(null, 'client.ru').status).toBe('unknown');
  });
  it('лицензия без домена привязывается первым ping', () => {
    expect(decideStatus({ ...LIC, domain: 'не указан', allowed_domains: [] }, 'new.ru')).toEqual({ status: 'active', bind: true });
  });
  it('localhost и *.vercel.app не считаются нарушением', () => {
    expect(decideStatus(LIC, 'localhost').status).toBe('active');
    expect(decideStatus(LIC, 'preview-x.vercel.app').status).toBe('active');
  });
  it('маскирование домена для логов', () => {
    expect(maskDomain('mysalon.ru')).toBe('m***n.ru');
    expect(maskDomain('ab.ru')).toBe('a*.ru');
    expect(maskDomain('localhost')).toBe('***');
  });
});

describe('license-server: handlePing', () => {
  it('клиент и сервер договариваются: active, ping записан', async () => {
    const m = memoryStore([LIC]);
    const out = await sendPing(await clientCfg(), 'client.ru', '1.2.0', loopback(m.store, []));
    expect(out).toEqual({ ok: true, status: 'active' });
    expect(m.pings).toHaveLength(1);
    expect(m.pings[0]).toMatchObject({ status: 'active', domain: 'client.ru', ip: '10.0.0.1', version: '1.2.0' });
  });

  it('ключ другой лицензии не подходит → unknown', async () => {
    const m = memoryStore([LIC]);
    const wrong = { ...CFG, secret: await deriveLicenseKey(MASTER, '22222222-2222-4222-8222-222222222222') };
    const out = await sendPing(wrong, 'client.ru', '1', loopback(m.store, []));
    expect(out.ok).toBe(false);
    expect(m.pings).toHaveLength(0);
  });

  it('unverified → один алерт в сутки, домен замаскирован', async () => {
    const m = memoryStore([LIC]);
    const alerts: string[] = [];
    const cfg = await clientCfg();
    await sendPing(cfg, 'evil-site.ru', '1', loopback(m.store, alerts));
    await sendPing(cfg, 'evil-site.ru', '1', loopback(m.store, alerts));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).not.toContain('evil-site.ru');
    expect(alerts[0]).toContain('e***e.ru');
  });

  it('blocked подписан и доходит до клиента', async () => {
    const m = memoryStore([{ ...LIC, revoked: true }]);
    expect(await sendPing(await clientCfg(), 'client.ru', '1', loopback(m.store, []))).toEqual({ ok: true, status: 'blocked' });
  });

  it('невалидное тело → 400 без подписи', async () => {
    const m = memoryStore([LIC]);
    const r = await handlePing({ raw_body: '{"license_id":"x"}', signature: null, ip: null, user_agent: null, now: NOW }, { store: m.store, alert: async () => undefined, master_secret: MASTER });
    expect(r.http_status).toBe(400);
    expect(r.signature).toBeNull();
  });

  it('старый клиент без nonce получает статус (совместимость)', async () => {
    const m = memoryStore([LIC]);
    const body = JSON.stringify({ license_id: LIC.license_id, domain: 'client.ru', version: '0.1.0' });
    const r = await handlePing({ raw_body: body, signature: null, ip: null, user_agent: null, now: NOW }, { store: m.store, alert: async () => undefined, master_secret: MASTER });
    expect(r.http_status).toBe(200);
    expect(JSON.parse(r.body).status).toBe('active');
    expect(m.pings[0].version).toBe('0.1.0 (legacy)');
  });

  it('запрос со старой меткой времени отклоняется', async () => {
    const m = memoryStore([LIC]);
    const key = await deriveLicenseKey(MASTER, LIC.license_id);
    const body = JSON.stringify({ license_id: LIC.license_id, domain: 'client.ru', version: '1', nonce: 'nonce-123456', ts: '2026-01-01T00:00:00.000Z' });
    const r = await handlePing({ raw_body: body, signature: await hmacSign(key, body), ip: null, user_agent: null, now: NOW }, { store: m.store, alert: async () => undefined, master_secret: MASTER });
    expect(r.http_status).toBe(401);
  });
});

describe('license-server: раунд 1 (привязка, журнал, лимит)', () => {
  const UNBOUND: LicenseRow = { ...LIC, domain: 'не указан', allowed_domains: [] };

  it('неподписанный legacy-ping не привязывает пустую лицензию к своему домену', async () => {
    const m = memoryStore([UNBOUND]);
    const body = JSON.stringify({ license_id: LIC.license_id, domain: 'squatter.ru', version: '0.1.0' });
    await handlePing({ raw_body: body, signature: null, ip: null, user_agent: null, now: NOW }, { store: m.store, alert: async () => undefined, master_secret: MASTER });
    expect(m.bound).toEqual([]);
  });

  it('подписанный ping привязывает пустую лицензию', async () => {
    const m = memoryStore([UNBOUND]);
    expect(await sendPing(await clientCfg(), 'new-client.ru', '1', loopback(m.store, []))).toEqual({ ok: true, status: 'active' });
    expect(m.bound).toEqual([`${LIC.license_id}:new-client.ru`]);
  });

  it('одинаковые ping в течение часа пишутся в журнал один раз', async () => {
    const m = memoryStore([LIC]);
    const cfg = await clientCfg();
    for (let i = 0; i < 5; i += 1) await sendPing(cfg, 'client.ru', '1', loopback(m.store, []));
    expect(m.pings).toHaveLength(1);
    await sendPing(cfg, 'evil.ru', '1', loopback(m.store, []));
    expect(m.pings.map((p) => p.status)).toEqual(['active', 'unverified']);
  });

  it('ключ rate limit: лицензия + IP, мусор — только IP', () => {
    const body = JSON.stringify({ license_id: LIC.license_id.toUpperCase(), domain: 'a.ru' });
    expect(rateLimitKey(body, '1.2.3.4')).toBe(`license_ping:${LIC.license_id}:ip:1.2.3.4`);
    expect(rateLimitKey('garbage', '1.2.3.4')).toBe('license_ping:ip:1.2.3.4');
    expect(rateLimitKey('{"license_id":"not-uuid"}', null)).toBe('license_ping:ip:none');
  });

  it('подписанный 401 не перезаписывает подтверждённый статус (остаёмся в grace)', async () => {
    const prev = resolveAfterSuccess('active', new Date(NOW.getTime() - 2 * DAY));
    const cookie = await encodeLicenseCookie(SECRET, prev);
    const r = await checkLicense({ domain: 'a.ru', version: '1', cookie, now: NOW, config: CFG, fetchImpl: fakeServer('unknown', { http: 401 }).impl });
    expect(r?.state).toMatchObject({ status: 'active', source: 'grace' });
  });
});

// ---------- Route handler /api/license/ping ----------

import { POST as pingRoute } from '@/app/api/license/ping/route';

describe('POST /api/license/ping', () => {
  beforeEach(() => {
    routeEnv.rows = [LIC];
    routeEnv.pings = [];
    routeEnv.alerts = [];
    routeEnv.rate_ok = true;
    routeEnv.fail_db = false;
    process.env.LICENSE_HMAC_SECRET = MASTER;
  });

  // Клиентский fetch, который вызывает route handler напрямую.
  const viaRoute = async (url: string, init: RequestInit): Promise<Response> => pingRoute(new Request(url, init));

  it('подписанный ping → active, подпись проверена клиентом', async () => {
    expect(await sendPing(await clientCfg(), 'client.ru', '1', viaRoute)).toEqual({ ok: true, status: 'active' });
    expect(routeEnv.pings).toHaveLength(1);
  });

  it('ответ содержит один из 4 статусов и no-store', async () => {
    const res = await pingRoute(new Request('https://x/api/license/ping', { method: 'POST', body: JSON.stringify({ license_id: LIC.license_id, domain: 'evil.ru' }) }));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(await res.text()).status).toBe('unverified');
  });

  it('zod: мусор → 400', async () => {
    const res = await pingRoute(new Request('https://x/api/license/ping', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(400);
  });

  it('слишком большое тело → 413', async () => {
    const res = await pingRoute(new Request('https://x/api/license/ping', { method: 'POST', body: 'x'.repeat(5000) }));
    expect(res.status).toBe(413);
  });

  it('rate limit → 429, клиент получает сбой (grace), а не blocked', async () => {
    routeEnv.rate_ok = false;
    expect(await sendPing(await clientCfg(), 'client.ru', '1', viaRoute)).toEqual({ ok: false, reason: 'http' });
  });

  it('БД упала → 503, клиент получает сбой', async () => {
    routeEnv.fail_db = true;
    expect(await sendPing(await clientCfg(), 'client.ru', '1', viaRoute)).toEqual({ ok: false, reason: 'http' });
  });
});
