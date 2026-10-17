// app/api/resolve-domain/route.test.ts — JSON-режим, redirect-режим (заголовки x-resolve-*), кэш, лимит, open redirect.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Template = { url_prefix: string };
type Row = { slug: string; status: string; vertical_templates: Template | Template[] | null };

const db = { row: null as Row | null, error: null as { message: string } | null, calls: 0 };
const allow = { value: true as boolean | 'throw' };

vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            db.calls += 1;
            return { data: db.row, error: db.error };
          },
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  hitRateLimit: async () => {
    if (allow.value === 'throw') throw new Error('rate_limits unavailable');
    return allow.value;
  },
}));

const SECRET = 'b'.repeat(64);
const ROW: Row = { slug: 'tire', status: 'client', vertical_templates: { url_prefix: 't' } };

async function load() {
  vi.resetModules();
  return import('./route');
}

function viaMiddleware(host: string, next: string, retry = false): Request {
  const headers: Record<string, string> = { 'x-resolve-host': host, 'x-resolve-next': next };
  if (retry) headers['x-resolve-retry'] = '1';
  return new Request(`https://${host}${next}`, { headers });
}

describe('GET /api/resolve-domain', () => {
  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', SECRET);
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://zapishisya.ru');
    db.row = ROW;
    db.error = null;
    db.calls = 0;
    allow.value = true;
  });

  it('JSON: только host, prefix, slug, status; кэш 60 с', async () => {
    const { GET } = await load();
    const res = await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=Client.RU'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, host: 'client.ru', prefix: 't', slug: 'tire', status: 'client' });
    expect(res.headers.get('cache-control')).toContain('max-age=60');
  });

  it('повторный запрос того же домена не идёт в БД', async () => {
    const { GET } = await load();
    await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=client.ru'));
    await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=client.ru'));
    expect(db.calls).toBe(1);
  });

  it('неизвестный домен → 404, не падает; некорректный host → 400', async () => {
    db.row = null;
    const { GET } = await load();
    expect((await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=none.ru'))).status).toBe(404);
    expect((await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=a%20b'))).status).toBe(400);
    expect((await GET(new Request('https://zapishisya.ru/api/resolve-domain'))).status).toBe(400);
  });

  it('ошибка БД → 503 без текста ошибки', async () => {
    db.error = { message: 'connection refused to db.internal' };
    const { GET } = await load();
    const res = await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=client.ru'));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('db.internal');
  });

  it('перебор: лимит исчерпан → 429', async () => {
    allow.value = false;
    const { GET } = await load();
    expect((await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=client.ru'))).status).toBe(429);
  });

  it('rate limit недоступен → fail open (ТЗ §17.5), домен резолвится', async () => {
    allow.value = 'throw';
    const { GET } = await load();
    expect((await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=client.ru'))).status).toBe(200);
  });

  it('некорректный url_prefix/slug в БД → 404, а не битый путь', async () => {
    db.row = { slug: 'Bad Slug', status: 'client', vertical_templates: { url_prefix: 't' } };
    const { GET } = await load();
    expect((await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=client.ru'))).status).toBe(404);
  });

  it('связь шаблона массивом (PostgREST) поддерживается', async () => {
    db.row = { slug: 'tire', status: 'client', vertical_templates: [{ url_prefix: 'b' }] };
    const { GET } = await load();
    expect(await (await GET(new Request('https://zapishisya.ru/api/resolve-domain?host=client.ru'))).json()).toMatchObject({ prefix: 'b' });
  });

  it('redirect-режим: подписанная cookie и 307 на тот же путь с маркером', async () => {
    const { GET } = await load();
    const res = await GET(viaMiddleware('client.ru', '/services?a=1'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.host).toBe('client.ru');
    expect(location.pathname).toBe('/services');
    expect(location.searchParams.get('a')).toBe('1');
    expect(location.searchParams.get('__dm')).toBe('1');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    // Next кодирует «|» как %7C; middleware получает уже декодированное значение — проверяем ту же цепочку.
    const raw = decodeURIComponent(/^domain_map=([^;]+)/.exec(cookie)?.[1] ?? '');
    const { verifyDomainMap } = await import('@/lib/domain-map');
    expect(await verifyDomainMap(raw, 'client.ru', SECRET)).toMatchObject({ prefix: 't', slug: 'tire', status: 'client' });
    expect(await verifyDomainMap(raw, 'other.ru', SECRET)).toBeNull();
  });

  it('повтор после установки cookie (cookie отключены) → 400 без цикла', async () => {
    const { GET } = await load();
    const res = await GET(viaMiddleware('client.ru', '/services', true));
    expect(res.status).toBe(400);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('open redirect через next отклоняется', async () => {
    const { GET } = await load();
    for (const next of ['//evil.com', '/\\evil.com', 'https://evil.com', `/${'a'.repeat(3000)}`]) {
      expect((await GET(viaMiddleware('client.ru', next))).status, next).toBe(400);
    }
  });

  it('нет ENCRYPTION_KEY → та же страница на основном домене', async () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    const { GET } = await load();
    const res = await GET(viaMiddleware('client.ru', '/services'));
    expect(res.headers.get('location')).toBe('https://zapishisya.ru/t/tire/services');
  });
});
