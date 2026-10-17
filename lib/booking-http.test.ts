// lib/booking-http.test.ts — формат ошибок API, CSRF Origin, чтение тела, rate limit → 429.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const limiter = { allowed: true, retryAfter: 0 };
vi.mock('./rate-limit', () => ({
  clientIp: () => '203.0.113.7',
  rateLimitScope: async () => ({ allowed: limiter.allowed, hits: 1, retryAfter: limiter.retryAfter }),
}));

const { fail, ok, isSameOrigin, readJson, validationFailure, limitOrFail, REASON_STATUS } = await import('./booking-http');

const post = (headers: Record<string, string>, body = '{}') => new Request('http://zapishisya.ru/api/bookings', { method: 'POST', headers, body });

describe('fail / ok', () => {
  it('статусы по дереву решений', async () => {
    expect(fail({ reason: 'validation' }).status).toBe(400);
    expect(fail({ reason: 'rate_limited' }).status).toBe(429);
    expect(fail({ reason: 'not_found' }).status).toBe(404);
    expect(fail({ reason: 'slot_taken' }).status).toBe(409);
    expect(fail({ reason: 'too_late', phone: '+7' }).status).toBe(409);
    expect(fail({ reason: 'server' }).status).toBe(500);
    expect(Object.keys(REASON_STATUS)).toHaveLength(11);
  });

  it('тело { ok: false, reason } и no-store', async () => {
    const res = fail({ reason: 'too_late', phone: '+79990001122' });
    expect(await res.json()).toEqual({ ok: false, reason: 'too_late', phone: '+79990001122' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('ok: статус и заголовки по умолчанию переопределяются', async () => {
    const res = ok({ ok: true as const }, { status: 201, headers: { 'Cache-Control': 'public, max-age=10' } });
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('public, max-age=10');
  });
});

describe('isSameOrigin (CSRF)', () => {
  it('тот же хост — ок, чужой — нет', () => {
    expect(isSameOrigin(post({ origin: 'https://zapishisya.ru', host: 'zapishisya.ru' }))).toBe(true);
    expect(isSameOrigin(post({ origin: 'https://evil.example', host: 'zapishisya.ru' }))).toBe(false);
  });

  it('кастомный домен через прокси (x-forwarded-host)', () => {
    expect(isSameOrigin(post({ origin: 'https://salon.ru', host: 'internal', 'x-forwarded-host': 'salon.ru' }))).toBe(true);
  });

  it('регистр хоста не важен; порт важен', () => {
    expect(isSameOrigin(post({ origin: 'https://ZAPISHISYA.ru', host: 'zapishisya.ru' }))).toBe(true);
    expect(isSameOrigin(post({ origin: 'http://localhost:3001', host: 'localhost:3000' }))).toBe(false);
  });

  it('нет Origin (не браузер) — ок; Origin: null или мусор — нет', () => {
    expect(isSameOrigin(post({ host: 'zapishisya.ru' }))).toBe(true);
    expect(isSameOrigin(post({ origin: 'null', host: 'zapishisya.ru' }))).toBe(false);
  });
});

describe('readJson', () => {
  it('валидный JSON', async () => {
    expect(await readJson(post({}, '{"a":1}'))).toEqual({ a: 1 });
  });

  it('пустое тело, мусор, слишком большое — null', async () => {
    expect(await readJson(post({}, ''))).toBeNull();
    expect(await readJson(post({}, '{oops'))).toBeNull();
    expect(await readJson(post({}, JSON.stringify({ x: 'a'.repeat(20_000) })))).toBeNull();
    expect(await readJson(post({ 'content-length': '999999' }, '{}'))).toBeNull();
  });
});

describe('validationFailure', () => {
  it('ошибки zod группируются по полям, первое поле — field', () => {
    const schema = z.object({ name: z.string().min(2, 'коротко'), phone: z.string().min(10, 'телефон') });
    const parsed = schema.safeParse({ name: 'a', phone: '1' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(validationFailure(parsed.error)).toEqual({
      reason: 'validation', field: 'name', fields: { name: ['коротко'], phone: ['телефон'] },
    });
  });

  it('ошибка корня (не объект) — ключ _', () => {
    const parsed = z.object({}).safeParse(null);
    if (parsed.success) return;
    expect(validationFailure(parsed.error).fields).toHaveProperty('_');
  });
});

describe('limitOrFail', () => {
  it('разрешено — null; отказ — 429 с Retry-After', async () => {
    limiter.allowed = true;
    expect(await limitOrFail('booking', post({}))).toBeNull();
    limiter.allowed = false;
    limiter.retryAfter = 420;
    const res = await limitOrFail('booking', post({}));
    expect(res?.status).toBe(429);
    expect(res?.headers.get('retry-after')).toBe('420');
    expect(await res?.json()).toEqual({ ok: false, reason: 'rate_limited', retryAfter: 420 });
  });
});
