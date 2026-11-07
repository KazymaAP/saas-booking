// lib/analytics.test.ts — Vitest: хэширование, сессия, валидация, нормализация, DNT, вставка (ТЗ §12.3).
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Мок Supabase: фиксируем, что именно уходит в analytics_events.
const insertMock = vi.fn();
vi.mock('./supabase', () => ({
  adminClient: () => ({ from: () => ({ insert: insertMock }) }),
}));

import {
  ANALYTICS_EVENTS,
  SESSION_TTL_SECONDS,
  buildEventRow,
  clientIp,
  dailySalt,
  getSessionId,
  hashIp,
  hashUa,
  insertEvents,
  isAnalyticsEvent,
  isBot,
  isDoNotTrack,
  isPrefetch,
  isValidSessionId,
  normalizePath,
  normalizeReferrer,
  readCookie,
  sessionCookie,
  sha256Hex,
  trackPageview,
} from './analytics';

const SALT = 'test-salt-0123456789abcdef';
const BUSINESS_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hashIp / hashUa', () => {
  it('SHA-256(значение + соль), hex 64', async () => {
    const expected = createHash('sha256').update(`1.2.3.4${SALT}`).digest('hex');
    await expect(hashIp('1.2.3.4', SALT)).resolves.toBe(expected);
    await expect(hashIp('1.2.3.4', SALT)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('детерминирован и не содержит исходного значения', async () => {
    const a = await hashUa(CHROME_UA, SALT);
    const b = await hashUa(CHROME_UA, SALT);
    expect(a).toBe(b);
    expect(a).not.toContain('Chrome');
  });

  it('другая соль — другой хэш (дамп без соли бесполезен)', async () => {
    const a = await hashIp('1.2.3.4', SALT);
    const b = await hashIp('1.2.3.4', `${SALT}-other`);
    expect(a).not.toBe(b);
  });

  it('без соли или без значения хэш не считается', async () => {
    await expect(hashIp('1.2.3.4', null)).resolves.toBeNull();
    await expect(hashIp(null, SALT)).resolves.toBeNull();
    await expect(hashUa('   ', SALT)).resolves.toBeNull();
  });

  it('соль берётся из ANALYTICS_SALT, короткая соль игнорируется', async () => {
    vi.stubEnv('ANALYTICS_SALT', SALT);
    await expect(hashIp('1.2.3.4')).resolves.toBe(await hashIp('1.2.3.4', SALT));
    vi.stubEnv('ANALYTICS_SALT', 'short');
    await expect(hashIp('1.2.3.4')).resolves.toBeNull();
  });

  it('sha256Hex совпадает с node:crypto', async () => {
    await expect(sha256Hex('abc')).resolves.toBe(createHash('sha256').update('abc').digest('hex'));
  });
});

describe('getSessionId / sessionCookie', () => {
  it('валидный sid из cookie переиспользуется', () => {
    const id = '1b4e28ba-2fa1-4d2e-8a3b-1e2f3a4b5c6d';
    expect(getSessionId(id)).toEqual({ id, isNew: false });
  });

  it('пустой или подделанный sid заменяется новым uuid v4', () => {
    for (const bad of [null, undefined, '', 'user@mail.ru', '1b4e28ba-2fa1-1d2e-8a3b-1e2f3a4b5c6d']) {
      const s = getSessionId(bad);
      expect(s.isNew).toBe(true);
      expect(isValidSessionId(s.id)).toBe(true);
    }
  });

  it('новые sid уникальны', () => {
    const ids = new Set(Array.from({ length: 50 }, () => getSessionId(null).id));
    expect(ids.size).toBe(50);
  });

  it('cookie: host-only, httpOnly, Secure, Lax, TTL 30 минут', () => {
    const c = sessionCookie('1b4e28ba-2fa1-4d2e-8a3b-1e2f3a4b5c6d');
    expect(SESSION_TTL_SECONDS).toBe(1800);
    expect(c).toContain('sid=1b4e28ba-2fa1-4d2e-8a3b-1e2f3a4b5c6d');
    expect(c).toContain('Max-Age=1800');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c.toLowerCase()).not.toContain('domain=');
  });

  it('readCookie достаёт значение по имени', () => {
    expect(readCookie('a=1; sid=xyz; b=2', 'sid')).toBe('xyz');
    expect(readCookie('a=1', 'sid')).toBeNull();
    expect(readCookie(null, 'sid')).toBeNull();
  });
});

describe('валидация события', () => {
  it('whitelist', () => {
    for (const e of ANALYTICS_EVENTS) expect(isAnalyticsEvent(e)).toBe(true);
    for (const e of ['click', 'PAGEVIEW', '', null, 1, {}]) expect(isAnalyticsEvent(e)).toBe(false);
  });

  it('неизвестное событие не строит строку', async () => {
    await expect(buildEventRow(BUSINESS_ID, 'drop table', '/', null, { ip: '1.1.1.1', ua: CHROME_UA, session_id: null, salt: SALT }))
      .resolves.toBeNull();
  });

  it('невалидный business_id отклоняется', async () => {
    await expect(buildEventRow("1' or 1=1", 'pageview', '/', null, { ip: null, ua: null, session_id: null, salt: SALT }))
      .resolves.toBeNull();
  });

  it('без соли событие не пишется (приватность важнее полноты)', async () => {
    await expect(buildEventRow(BUSINESS_ID, 'pageview', '/', null, { ip: '1.1.1.1', ua: CHROME_UA, session_id: null, salt: null }))
      .resolves.toBeNull();
  });
});

describe('суточная соль', () => {
  it('дата по Москве: 23:30 UTC 14.10 — уже 15.10 МСК', () => {
    expect(dailySalt(SALT, new Date('2026-10-14T23:30:00Z'))).toBe(`${SALT}:2026-10-15`);
    expect(dailySalt(SALT, new Date('2026-10-14T20:59:59Z'))).toBe(`${SALT}:2026-10-14`);
  });

  it('один IP в разные дни даёт разные ip_hash, в один день — одинаковые', async () => {
    const ctx = { ip: '203.0.113.7', ua: CHROME_UA, session_id: null, salt: SALT };
    const day1a = await buildEventRow(null, 'pageview', '/', null, { ...ctx, now: new Date('2026-10-15T08:00:00Z') });
    const day1b = await buildEventRow(null, 'pageview', '/', null, { ...ctx, now: new Date('2026-10-15T18:00:00Z') });
    const day2 = await buildEventRow(null, 'pageview', '/', null, { ...ctx, now: new Date('2026-10-16T08:00:00Z') });
    expect(day1a?.ip_hash).toBe(day1b?.ip_hash);
    expect(day1a?.ip_hash).not.toBe(day2?.ip_hash);
    expect(day1a?.ua_hash).not.toBe(day2?.ua_hash);
    expect(day1a?.ip_hash).toBe(await hashIp('203.0.113.7', `${SALT}:2026-10-15`));
  });
});

describe('нормализация без PII', () => {
  it('path: без query/hash, токены скрыты, длина ограничена', () => {
    expect(normalizePath('/s/salon?token=abc&utm_source=x#top')).toBe('/s/salon');
    expect(normalizePath('/s/salon/booking/cancel/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d')).toBe('/s/salon/booking/cancel/:token');
    expect(normalizePath('/track/0123456789abcdef0123456789abcdef')).toBe('/track/:token');
    expect(normalizePath('https://evil.example/')).toBeNull();
    expect(normalizePath(`/${'x'.repeat(2000)}`)?.length).toBe(512);
    expect(normalizePath(null)).toBeNull();
  });

  it('referrer: только origin внешнего сайта', () => {
    expect(normalizeReferrer('https://yandex.ru/search/?text=мой+телефон+89991234567')).toBe('https://yandex.ru');
    expect(normalizeReferrer('https://zapishisya.ru/s/other', 'zapishisya.ru')).toBeNull();
    expect(normalizeReferrer('javascript:alert(1)')).toBeNull();
    expect(normalizeReferrer('not a url')).toBeNull();
  });

  it('строка события не содержит сырого IP/UA', async () => {
    const row = await buildEventRow(BUSINESS_ID, 'pageview', '/s/salon?phone=8999', 'https://google.com/?q=x', {
      ip: '203.0.113.7', ua: CHROME_UA, session_id: '1b4e28ba-2fa1-4d2e-8a3b-1e2f3a4b5c6d', host: 'zapishisya.ru', salt: SALT,
    });
    expect(row).not.toBeNull();
    const json = JSON.stringify(row);
    expect(json).not.toContain('203.0.113.7');
    expect(json).not.toContain('Chrome');
    expect(json).not.toContain('8999');
    expect(row?.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.referrer).toBe('https://google.com');
  });
});

describe('DNT, боты, IP', () => {
  it('DNT: 1 и Sec-GPC: 1 запрещают трекинг', () => {
    expect(isDoNotTrack(new Headers({ dnt: '1' }))).toBe(true);
    expect(isDoNotTrack(new Headers({ 'sec-gpc': '1' }))).toBe(true);
    expect(isDoNotTrack(new Headers({ dnt: '0' }))).toBe(false);
    expect(isDoNotTrack(new Headers())).toBe(false);
  });

  it('prefetch/prerender не считается просмотром', () => {
    expect(isPrefetch(new Headers({ 'sec-purpose': 'prefetch;prerender' }))).toBe(true);
    expect(isPrefetch(new Headers({ purpose: 'prefetch' }))).toBe(true);
    expect(isPrefetch(new Headers({ 'x-moz': 'prefetch' }))).toBe(true);
    expect(isPrefetch(new Headers())).toBe(false);
  });

  it('боты и пустой UA не считаются', () => {
    expect(isBot('Googlebot/2.1')).toBe(true);
    expect(isBot('Mozilla/5.0 HeadlessChrome/120')).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot(CHROME_UA)).toBe(false);
  });

  it('clientIp: первый адрес из x-forwarded-for, затем x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe('insertEvents / trackPageview', () => {
  it('пишет одну строку с хэшами', async () => {
    vi.stubEnv('ANALYTICS_SALT', SALT);
    const ok = await trackPageview(BUSINESS_ID, 'pageview', '/s/salon', null, { ip: '1.2.3.4', ua: CHROME_UA, session_id: null });
    expect(ok).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [rows] = insertMock.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ip_hash).toBe(await hashIp('1.2.3.4', dailySalt(SALT)));
  });

  it('ошибка БД не пробрасывается', async () => {
    insertMock.mockResolvedValue({ error: { code: '23514' } });
    await expect(insertEvents([{ business_id: null, event: 'pageview', path: '/', ip_hash: null, ua_hash: null, referrer: null, session_id: null }]))
      .resolves.toBe(false);
    insertMock.mockRejectedValue(new Error('network'));
    await expect(insertEvents([{ business_id: null, event: 'pageview', path: '/', ip_hash: null, ua_hash: null, referrer: null, session_id: null }]))
      .resolves.toBe(false);
  });

  it('пустая пачка не ходит в БД', async () => {
    await expect(insertEvents([])).resolves.toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('невалидное событие не ходит в БД', async () => {
    vi.stubEnv('ANALYTICS_SALT', SALT);
    await expect(trackPageview(BUSINESS_ID, 'hack', '/', null, { ip: null, ua: null, session_id: null })).resolves.toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
