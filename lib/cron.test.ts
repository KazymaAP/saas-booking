// lib/cron.test.ts — авторизация cron и обёртка runCronJob.
import { describe, expect, it, vi } from 'vitest';
import { errorMessage, isCronAuthorized, redactPii, requireCron, runCronJob, type CronHandler } from './cron';
import { createTestContext, fail, ok } from './test-utils/supabase-mock';

const SECRET = 'a1b2c3d4e5f6';
const URL_JOB = 'https://example.test/api/cron/test';

function request(authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new Request(URL_JOB, { headers });
}

describe('isCronAuthorized', () => {
  it('валидный токен → true', () => {
    expect(isCronAuthorized(request(`Bearer ${SECRET}`), SECRET)).toBe(true);
  });

  it('неверный токен → false', () => {
    expect(isCronAuthorized(request('Bearer wrong'), SECRET)).toBe(false);
    expect(isCronAuthorized(request(`Bearer ${SECRET}x`), SECRET)).toBe(false);
    expect(isCronAuthorized(request(SECRET), SECRET)).toBe(false);
  });

  it('отсутствующий header → false', () => {
    expect(isCronAuthorized(request(), SECRET)).toBe(false);
  });

  it('пустой CRON_SECRET → false даже для "Bearer "', () => {
    expect(isCronAuthorized(request('Bearer '), '')).toBe(false);
    expect(isCronAuthorized(request('Bearer undefined'), undefined)).toBe(false);
    expect(isCronAuthorized(request('Bearer    '), '   ')).toBe(false);
  });

  it('по умолчанию читает process.env.CRON_SECRET', () => {
    process.env.CRON_SECRET = SECRET;
    expect(isCronAuthorized(request(`Bearer ${SECRET}`))).toBe(true);
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(request(`Bearer ${SECRET}`))).toBe(false);
  });
});

describe('requireCron', () => {
  it('без авторизации → 401', async () => {
    const res = requireCron(request('Bearer wrong'), SECRET);
    expect(res?.status).toBe(401);
    expect(await res?.json()).toEqual({ ok: false, reason: 'unauthorized' });
  });

  it('с авторизацией → null', () => {
    expect(requireCron(request(`Bearer ${SECRET}`), SECRET)).toBeNull();
  });
});

describe('runCronJob', () => {
  const authed = () => {
    process.env.CRON_SECRET = SECRET;
    return request(`Bearer ${SECRET}`);
  };

  it('401 и хендлер не вызывается без токена', async () => {
    process.env.CRON_SECRET = SECRET;
    let called = false;
    const handler: CronHandler = async () => {
      called = true;
      return {};
    };
    const res = await runCronJob('test', request(), handler, () => createTestContext());
    expect(res.status).toBe(401);
    expect(called).toBe(false);
  });

  it('успех → 200, результат в журнале, блокировка снята', async () => {
    const ctx = createTestContext((q) => (q.op === 'rpc' ? ok(true) : ok()));
    const res = await runCronJob('test', authed(), async () => ({ done: 3 }), () => ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run_id: string };
    expect(body).toMatchObject({ ok: true, job: 'test', result: { done: 3 } });
    expect(ctx.logMock.results[0]?.job).toBe('test');
    // run_id в ответе совпадает с записью журнала — по нему ответ pg_net сопоставляется с audit_log.
    expect(ctx.logMock.results[0]?.payload.run_id).toBe(body.run_id);
    expect(ctx.logMock.results[0]?.payload.done).toBe(3);
    expect(ctx.dbMock.queries.map((q) => q.table)).toEqual(['cron_try_lock', 'cron_unlock']);
  });

  it('исключение → 500 + logError, блокировка снята', async () => {
    const ctx = createTestContext((q) => (q.op === 'rpc' ? ok(true) : ok()));
    const res = await runCronJob('test', authed(), async () => {
      throw new Error('boom');
    }, () => ctx);
    expect(res.status).toBe(500);
    expect(ctx.logMock.errors[0]?.message).toBe('boom');
    expect(ctx.logMock.errors[0]?.payload.job).toBe('test');
    expect(ctx.dbMock.queries.at(-1)?.table).toBe('cron_unlock');
  });

  it('задача уже выполняется → skipped, хендлер не вызывается', async () => {
    const ctx = createTestContext((q) => (q.table === 'cron_try_lock' ? ok(false) : ok()));
    let called = false;
    const res = await runCronJob('test', authed(), async () => {
      called = true;
      return {};
    }, () => ctx);
    expect(await res.json()).toEqual({ ok: true, job: 'test', skipped: 'locked' });
    expect(called).toBe(false);
  });

  it('нет функции блокировки → работает, ошибка записана', async () => {
    const ctx = createTestContext((q) => (q.op === 'rpc' ? fail('function not found') : ok()));
    const res = await runCronJob('test', authed(), async () => ({ n: 1 }), () => ctx);
    expect(res.status).toBe(200);
    expect(ctx.logMock.errors.length).toBe(2);
  });
});

describe('runCronJob: сбои окружения и PII', () => {
  it('контекст не создаётся (нет env Supabase) → 500 JSON, без необработанного исключения', async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await runCronJob('test', request(`Bearer ${SECRET}`), async () => ({}), () => {
      throw new Error('supabaseUrl is required.');
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, reason: 'context', error: 'supabaseUrl is required.' });
  });

  it('блокировка берётся с TTL не больше 120 с (лимит функции 60 с + запас)', async () => {
    process.env.CRON_SECRET = SECRET;
    const ctx = createTestContext((q) => (q.op === 'rpc' ? ok(true) : ok()));
    await runCronJob('test', request(`Bearer ${SECRET}`), async () => ({}), () => ctx);
    const ttl = Number((ctx.dbMock.queries[0]?.payload as { p_ttl_seconds: number }).p_ttl_seconds);
    expect(ttl).toBeGreaterThanOrEqual(60);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it('адреса почты вырезаются из текста ошибки', async () => {
    process.env.CRON_SECRET = SECRET;
    expect(redactPii('550 Recipient address rejected: ivan.petrov+1@mail.ru')).toBe('550 Recipient address rejected: <email>');
    expect(errorMessage(new Error('to a@b.co and c@d.ru'))).toBe('to <email> and <email>');
    const ctx = createTestContext((q) => (q.op === 'rpc' ? ok(true) : ok()));
    const res = await runCronJob('test', request(`Bearer ${SECRET}`), async () => {
      throw new Error('bad rcpt client@x.ru');
    }, () => ctx);
    expect(JSON.stringify(await res.json())).not.toContain('client@x.ru');
    expect(ctx.logMock.errors[0]?.message).toBe('bad rcpt <email>');
  });
});

describe('runCronJob: сбой журнала не меняет исход задачи', () => {
  it('журнал результата упал → всё равно 200 и блокировка снята', async () => {
    process.env.CRON_SECRET = SECRET;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctx = createTestContext((q) => (q.op === 'rpc' ? ok(true) : ok()));
    ctx.log.result = () => Promise.reject(new Error('audit_log недоступен'));
    const res = await runCronJob('test', request(`Bearer ${SECRET}`), async () => ({ sent: 2 }), () => ctx);
    expect(res.status).toBe(200);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('журнал не записан'));
    expect(ctx.dbMock.queries.at(-1)?.table).toBe('cron_unlock');
  });

  it('задача упала и журнал ошибок тоже → 500 с текстом ошибки задачи, блокировка снята', async () => {
    process.env.CRON_SECRET = SECRET;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctx = createTestContext((q) => (q.op === 'rpc' ? ok(true) : ok()));
    ctx.log.error = () => Promise.reject(new Error('audit_log недоступен'));
    const res = await runCronJob('test', request(`Bearer ${SECRET}`), async () => {
      throw new Error('boom');
    }, () => ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, job: 'test', error: 'boom' });
    expect(ctx.dbMock.queries.at(-1)?.table).toBe('cron_unlock');
  });
});
