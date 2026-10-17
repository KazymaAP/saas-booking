// app/api/cron/check-domains/route.test.ts — Vercel API → ssl_status, одно уведомление админу о проблемах.
import { describe, expect, it } from 'vitest';
import { checkDomains, domainUrl } from '@/lib/cron-jobs/check-domains';
import { memoryContext } from '@/lib/test-utils/context';

const VERIFIED: Record<string, boolean> = { 'ok.ru': true, 'wait.ru': false };

const vercelFetch: typeof fetch = (input) => {
  const url = String(input);
  const domain = decodeURIComponent(url.split('/domains/')[1]?.split('?')[0] ?? '');
  if (domain === 'down.ru') return Promise.reject(new Error('network'));
  if (domain in VERIFIED) return Promise.resolve(Response.json({ verified: VERIFIED[domain] }));
  return Promise.resolve(new Response('not found', { status: 404 }));
};

function setup() {
  return memoryContext({
    businesses: [
      { id: '1', custom_domain: 'ok.ru', ssl_status: 'pending' },
      { id: '2', custom_domain: 'wait.ru', ssl_status: 'pending' },
      { id: '3', custom_domain: 'gone.ru', ssl_status: 'active' },
      { id: '4', custom_domain: 'down.ru', ssl_status: 'error' },
      { id: '5', custom_domain: null, ssl_status: 'pending' },
    ],
  }, { fetchImpl: vercelFetch });
}

describe('check-domains', () => {
  it('статусы: verified → active, не verified → pending, 404/сбой сети → error; UPDATE только при изменении', async () => {
    const ctx = setup();
    const result = await checkDomains(ctx);
    expect(result).toMatchObject({ checked: 4, changed: 2, problems: 3, notified: true });
    const ssl = (id: string) => ctx.mem.tables.businesses?.find((b) => b.id === id)?.ssl_status;
    expect([ssl('1'), ssl('2'), ssl('3'), ssl('4')]).toEqual(['active', 'pending', 'error', 'error']);
    expect(ctx.logMock.errors[0]?.message).toContain('network');
  });

  it('повтор в тот же день с тем же списком проблем — админ не получает второе сообщение', async () => {
    const ctx = setup();
    await checkDomains(ctx);
    const second = await checkDomains(ctx);
    expect(second.notified).toBe(false);
    expect(ctx.notifyMock.adminMessages.length).toBe(1);
  });

  it('без VERCEL_API_TOKEN — пропуск без запросов', async () => {
    const ctx = memoryContext({}, { env: { vercelApiToken: '' } });
    expect(await checkDomains(ctx)).toMatchObject({ checked: 0 });
    expect(ctx.mem.queries.length).toBe(0);
  });

  it('домен и teamId экранируются в URL', () => {
    const ctx = memoryContext({}, { env: { vercelTeamId: 'team 1' } });
    expect(domainUrl(ctx, 'a/b.ru')).toBe('https://api.vercel.com/v9/projects/prj_1/domains/a%2Fb.ru?teamId=team%201');
  });

  it('ошибка БД → исключение', async () => {
    const ctx = memoryContext({}, { failOn: () => 'db down' });
    await expect(checkDomains(ctx)).rejects.toThrow('db down');
  });

  it('изменения статусов пишутся батчем: не больше одного UPDATE на статус', async () => {
    const ctx = setup();
    await checkDomains(ctx);
    const updates = ctx.mem.queries.filter((q) => q.table === 'businesses' && q.op === 'update');
    expect(updates.length).toBeLessThanOrEqual(2);
  });

  it('уведомление админу не дошло → ключ освобождён, следующий запуск сообщит снова', async () => {
    const ctx = setup();
    let attempts = 0;
    ctx.notify.notifyAdmin = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('telegram 502');
      return true;
    };
    expect((await checkDomains(ctx)).notified).toBe(false);
    expect(ctx.logMock.errors.some((e) => e.message.includes('telegram 502'))).toBe(true);
    expect((await checkDomains(ctx)).notified).toBe(true);
    expect(attempts).toBe(2);
  });
});
