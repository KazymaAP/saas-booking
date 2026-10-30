// app/api/cron/[job]/route.test.ts — универсальный маршрут: 401, 404, реестр JOBS, 500 + logError, совпадение с реестром расписаний.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JOBS, handleCronRequest, isJobName } from '@/lib/cron-jobs';
import { SCHEDULES, UNSCHEDULED_JOBS } from '@/lib/schedules';
import { memoryContext } from '@/lib/test-utils/context';

const SECRET = 'route-secret-123';
const AGENT_8_JOBS = ['send-emails', 'check-replies'];
// Маршруты, намеренно НЕ использующие обёртку cronRoute: backup — статический маршрут со своим GET и
// maxDuration = 300 (бэкап больших таблиц страницами, до 10 мин). Имеет приоритет над [job], поэтому
// старый job 'backup' больше не вызывается по этому пути. Безопасность проверяется отдельным тестом ниже.
const BESPOKE_STATIC_ROUTES = ['backup'];

function request(token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  return new Request('https://example.test/api/cron/x', { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('/api/cron/[job]', () => {
  it('без токена → 401, контекст не создаётся', async () => {
    let created = false;
    const res = await handleCronRequest('archive-refused', request(), {
      makeContext: () => {
        created = true;
        return memoryContext();
      },
    });
    expect(res.status).toBe(401);
    expect(created).toBe(false);
  });

  it('неизвестная задача с токеном → 404; без токена → 401 (список задач не раскрывается)', async () => {
    const found = await handleCronRequest('no-such-job', request(SECRET), { makeContext: () => memoryContext() });
    expect(found.status).toBe(404);
    expect(await found.json()).toEqual({ ok: false, job: 'no-such-job', reason: 'unknown_job' });
    expect((await handleCronRequest('no-such-job', request('bad'))).status).toBe(401);
  });

  it('прототипное имя (constructor) не считается задачей', () => {
    expect(isJobName('constructor')).toBe(false);
    expect(isJobName('__proto__')).toBe(false);
  });

  it('успешная задача → 200 и итог в журнале', async () => {
    const ctx = memoryContext({ businesses: [] });
    const res = await handleCronRequest('archive-refused', request(SECRET), { makeContext: () => ctx });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, job: 'archive-refused', result: { archived: 0 } });
    expect(ctx.logMock.results[0]?.job).toBe('archive-refused');
  });

  it('ошибка БД в задаче → 500 + logError с именем задачи', async () => {
    const ctx = memoryContext({}, { failOn: (q) => (q.table === 'businesses' ? 'db down' : null) });
    const res = await handleCronRequest('archive-refused', request(SECRET), { makeContext: () => ctx });
    expect(res.status).toBe(500);
    expect(ctx.logMock.errors[0]?.message).toContain('db down');
    expect(ctx.logMock.errors[0]?.payload.job).toBe('archive-refused');
  });

  it('JOBS покрывает все HTTP-задачи реестра (кроме зоны агента 8) и только их', () => {
    const http = SCHEDULES.filter((s) => s.runner !== 'pg_cron_sql').map((s) => s.name)
      .filter((name) => AGENT_8_JOBS.includes(name) === false);
    expect(Object.keys(JOBS).sort()).toEqual([...http, ...UNSCHEDULED_JOBS].sort());
  });
});

describe('статические маршруты app/api/cron/<job>/route.ts', () => {
  const root = join(process.cwd(), 'app', 'api', 'cron');
  const routes = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '[job]' && AGENT_8_JOBS.includes(d.name) === false && BESPOKE_STATIC_ROUTES.includes(d.name) === false)
    .map((d) => d.name);

  it.each(routes)('%s: cronRoute с тем же именем, nodejs, maxDuration ≤ 60, force-dynamic', (name) => {
    const source = readFileSync(join(root, name, 'route.ts'), 'utf8');
    expect(isJobName(name)).toBe(true);
    expect(source).toContain(`cronRoute('${name}')`);
    expect(source).toContain("runtime = 'nodejs'");
    expect(source).toContain("dynamic = 'force-dynamic'");
    expect(Number(/maxDuration = (\d+)/.exec(source)?.[1])).toBeLessThanOrEqual(60);
  });

  // backup — исключение из общего правила (см. BESPOKE_STATIC_ROUTES), но авторизация и изоляция обязательны.
  it('backup: bespoke-маршрут с авторизацией, nodejs и force-dynamic', () => {
    const source = readFileSync(join(root, 'backup', 'route.ts'), 'utf8');
    expect(source).toContain('isCronAuthorized');
    expect(source).toContain("runtime = 'nodejs'");
    expect(source).toContain("dynamic = 'force-dynamic'");
    expect(Number(/maxDuration = (\d+)/.exec(source)?.[1])).toBeGreaterThan(60);
  });
});
