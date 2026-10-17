// app/api/cron/follow-up/route.test.ts — повторы молчунам: стадии 30/60 → письмо + emails_outgoing, 90 → archived.
import { describe, expect, it } from 'vitest';
import { FOLLOW_UP_SUBJECT, followUp } from '@/lib/cron-jobs/follow-up';
import { memoryContext } from '@/lib/test-utils/context';
import type { Row } from '@/lib/test-utils/memory-db';

function setup(stages: Row[], options: { mailThrows?: boolean } = {}) {
  return memoryContext({
    businesses: [
      { id: 'b1', name: 'Студия', emails: ['b1@test.ru'], status: 'sent' },
      { id: 'b2', name: 'Молчун', emails: ['b2@test.ru'], status: 'sent' },
      { id: 'b3', name: 'Ответил', emails: ['b3@test.ru'], status: 'replied' },
      { id: 'b4', name: 'Без почты', emails: [], status: 'sent' },
    ],
    emails_outgoing: [],
    cron_marks: stages.map((s) => ({ job: 'follow-up', key: `${String(s.business_id)}:${String(s.stage)}` })),
  }, { ...options, rpc: { cron_claim_follow_up: () => stages } });
}

describe('follow-up', () => {
  it('first → письмо и запись в emails_outgoing; archive → archived', async () => {
    const ctx = setup([{ business_id: 'b1', stage: 'first' }, { business_id: 'b2', stage: 'archive' }]);
    const result = await followUp(ctx);
    expect(result).toMatchObject({ claimed: 2, sent: 1, archived: 1, failed: 0 });
    expect(ctx.notifyMock.mails[0]).toMatchObject({ to: 'b1@test.ru', subject: FOLLOW_UP_SUBJECT });
    expect(ctx.mem.tables.emails_outgoing?.[0]).toMatchObject({ business_id: 'b1', status: 'sent' });
    expect(ctx.mem.tables.businesses?.find((b) => b.id === 'b2')?.status).toBe('archived');
  });

  it('бизнес уже ответил (не sent) — письма нет', async () => {
    const ctx = setup([{ business_id: 'b3', stage: 'second' }]);
    const result = await followUp(ctx);
    expect(result.sent).toBe(0);
    expect(ctx.notifyMock.mails.length).toBe(0);
  });

  it('пустой захват (стадии уже выполнены) — ничего не делает', async () => {
    const ctx = setup([]);
    expect(await followUp(ctx)).toEqual({ claimed: 0, sent: 0, archived: 0, no_email: 0, failed: 0 });
  });

  it('без email — no_email, ключ не освобождается', async () => {
    const ctx = setup([{ business_id: 'b4', stage: 'first' }]);
    const result = await followUp(ctx);
    expect(result.no_email).toBe(1);
    expect(ctx.mem.tables.cron_marks?.length).toBe(1);
  });

  it('сбой SMTP → ключ стадии освобождён, журнал письма не пишется', async () => {
    const ctx = setup([{ business_id: 'b1', stage: 'first' }], { mailThrows: true });
    const result = await followUp(ctx);
    expect(result.failed).toBe(1);
    expect(ctx.mem.tables.cron_marks?.length).toBe(0);
    expect(ctx.mem.tables.emails_outgoing?.length).toBe(0);
  });

  it('сбой БД после захвата (чтение бизнесов) → стадии освобождены, исключение наружу', async () => {
    const stages = [{ business_id: 'b1', stage: 'first' }];
    const ctx = memoryContext({
      businesses: [], cron_marks: [{ job: 'follow-up', key: 'b1:first' }],
    }, {
      rpc: { cron_claim_follow_up: () => stages },
      failOn: (q) => (q.table === 'businesses' && q.op === 'select' ? 'connection reset' : null),
    });
    await expect(followUp(ctx)).rejects.toThrow('connection reset');
    expect(ctx.mem.tables.cron_marks?.length).toBe(0);
  });
});
