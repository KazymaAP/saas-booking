// app/api/track/page/route.test.ts — Vitest: приём событий pixel (ТЗ §12.3). Supabase и rate limit замоканы.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
const businessMock = vi.fn();
const rateMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({
    from: (table: string) => (table === 'analytics_events'
      ? { insert: insertMock }
      : { select: () => ({ eq: () => ({ maybeSingle: businessMock }) }) }),
    rpc: (fn: string, args: Record<string, unknown>) => rateMock(fn, args),
  }),
}));

import { POST } from './route';

const SALT = 'test-salt-0123456789abcdef';
const BUSINESS_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
const SID = '1b4e28ba-2fa1-4d2e-8a3b-1e2f3a4b5c6d';

// Уникальный IP на тест: кэш бизнесов в модуле общий, а rate limit замокан — так тесты независимы.
let ipCounter = 0;

function request(body: unknown, headers: Record<string, string> = {}): Request {
  ipCounter += 1;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://zapishisya.ru/api/track/page', {
    method: 'POST',
    body: text,
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      'user-agent': CHROME_UA,
      'x-forwarded-for': `203.0.113.${ipCounter}`,
      host: 'zapishisya.ru',
      ...headers,
    },
  });
}

function insertedRows(): Array<Record<string, unknown>> {
  const call = insertMock.mock.calls[0] as [Array<Record<string, unknown>>] | undefined;
  return call ? call[0] : [];
}

beforeEach(() => {
  vi.stubEnv('ANALYTICS_SALT', SALT);
  insertMock.mockReset().mockResolvedValue({ error: null });
  businessMock.mockReset().mockResolvedValue({ data: { id: BUSINESS_ID }, error: null });
  rateMock.mockReset().mockResolvedValue({ data: true, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/track/page', () => {
  it('pageview → 204 без тела, sid-cookie, строка с хэшами без сырого IP/UA', async () => {
    const res = await POST(request({ business_id: BUSINESS_ID, event: 'pageview', path: '/s/salon?utm=1', referrer: 'https://ya.ru/?q=1' }));
    expect(res.status).toBe(204);
    await expect(res.text()).resolves.toBe('');
    expect(res.headers.get('set-cookie')).toMatch(/^sid=[0-9a-f-]{36}; Path=\/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax$/);
    const rows = insertedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ business_id: BUSINESS_ID, event: 'pageview', path: '/s/salon', referrer: 'https://ya.ru' });
    expect(JSON.stringify(rows)).not.toMatch(/203\.0\.113|Chrome/);
  });

  it('существующий sid переиспользуется', async () => {
    const res = await POST(request({ business_id: BUSINESS_ID, event: 'pageview', path: '/' }, { cookie: `sid=${SID}` }));
    expect(res.status).toBe(204);
    expect(insertedRows()[0]?.session_id).toBe(SID);
    expect(res.headers.get('set-cookie')).toContain(`sid=${SID}`);
  });

  it('пачка событий пишется одним insert', async () => {
    const res = await POST(request({ events: [
      { business_id: BUSINESS_ID, event: 'pageview', path: '/' },
      { business_id: BUSINESS_ID, event: 'phone_click', path: '/' },
    ] }));
    expect(res.status).toBe(204);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertedRows().map((r) => r.event)).toEqual(['pageview', 'phone_click']);
  });

  it('DNT и Sec-GPC: 204, ничего не пишется, cookie не ставится', async () => {
    const privacyHeaders: Array<Record<string, string>> = [{ dnt: '1' }, { 'sec-gpc': '1' }];
    for (const h of privacyHeaders) {
      const res = await POST(request({ business_id: BUSINESS_ID, event: 'pageview', path: '/' }, h));
      expect(res.status).toBe(204);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
    expect(insertMock).not.toHaveBeenCalled();
    expect(rateMock).not.toHaveBeenCalled();
  });

  it('prefetch-запрос: 204 без записи и без cookie', async () => {
    const res = await POST(request({ event: 'pageview', path: '/' }, { 'sec-purpose': 'prefetch' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('бот: 204 без записи', async () => {
    const res = await POST(request({ event: 'pageview', path: '/' }, { 'user-agent': 'Googlebot/2.1' }));
    expect(res.status).toBe(204);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('невалидный JSON, неизвестное событие, лишняя пачка → 400 без тела', async () => {
    const tooMany = { events: Array.from({ length: 21 }, () => ({ event: 'pageview', path: '/' })) };
    for (const body of ['{oops', { event: 'hack', path: '/' }, { business_id: 'nope', event: 'pageview' }, tooMany]) {
      const res = await POST(request(body));
      expect(res.status).toBe(400);
      await expect(res.text()).resolves.toBe('');
    }
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('слишком большое тело → 413', async () => {
    const res = await POST(request({ event: 'pageview', path: '/' }, { 'content-length': String(64 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('лимит тела — в байтах и без Content-Length: кириллица 5000 символов (~10 КБ) → 413', async () => {
    const res = await POST(request({ event: 'pageview', path: `/${'я'.repeat(5000)}` }));
    expect(res.status).toBe(413);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('кириллический путь в пределах лимита принимается', async () => {
    const res = await POST(request({ business_id: BUSINESS_ID, event: 'pageview', path: '/s/салон-красоты' }));
    expect(res.status).toBe(204);
    expect(insertedRows()[0]?.path).toBe('/s/салон-красоты');
  });

  it('лимит 1000/час по хэшу IP: превышение → 429 с Retry-After', async () => {
    rateMock.mockResolvedValue({ data: false, error: null });
    const res = await POST(request({ event: 'pageview', path: '/' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('3600');
    const [fn, args] = rateMock.mock.calls[0] as [string, { p_bucket: string; p_limit: number; p_window_seconds: number }];
    expect(fn).toBe('analytics_rate_hit');
    expect(args.p_bucket).toMatch(/^track:[0-9a-f]{64}$/);
    expect([args.p_limit, args.p_window_seconds]).toEqual([1000, 3600]);
    // Сырой IP не уходит даже в хранилище лимитов.
    expect(JSON.stringify(args)).not.toContain('203.0.113.');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('fail open: хранилище лимитов и БД недоступны → всё равно 204', async () => {
    rateMock.mockRejectedValue(new Error('storage down'));
    insertMock.mockRejectedValue(new Error('db down'));
    const res = await POST(request({ event: 'pageview', path: '/' }));
    expect(res.status).toBe(204);
  });

  it('fail open: RPC лимита вернул ошибку → событие принимается', async () => {
    rateMock.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const res = await POST(request({ event: 'pageview', path: '/' }));
    expect(res.status).toBe(204);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('несуществующий бизнес не пишется', async () => {
    businessMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(request({ business_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', event: 'pageview', path: '/' }));
    expect(res.status).toBe(204);
    expect(insertedRows()).toHaveLength(0);
  });

  it('без ANALYTICS_SALT ничего не пишется (приватность важнее полноты)', async () => {
    vi.stubEnv('ANALYTICS_SALT', '');
    const res = await POST(request({ event: 'pageview', path: '/' }));
    expect(res.status).toBe(204);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
