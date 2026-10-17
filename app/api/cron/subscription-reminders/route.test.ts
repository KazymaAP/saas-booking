// app/api/cron/subscription-reminders/route.test.ts — подписка: за 3 дня, в день окончания, +7 заглушка, +30 архив.
import { describe, expect, it } from 'vitest';
import { subscriptionReminders } from '@/lib/cron-jobs/subscription-reminders';
import { moscowDate } from '@/lib/cron-jobs/shared';
import { TEST_NOW } from '@/lib/test-utils/supabase-mock';
import { memoryContext } from '@/lib/test-utils/context';
import type { Row } from '@/lib/test-utils/memory-db';

function client(id: string, untilShiftDays: number, extra: Row = {}): Row {
  return {
    id, name: `Клиент ${id}`, emails: [`${id}@client.test`], status: 'client', subscription_active: true,
    subscription_until: moscowDate(TEST_NOW, untilShiftDays), ...extra,
  };
}

describe('subscription-reminders', () => {
  it('за 3 дня и в день окончания — письма; за 5 дней — нет', async () => {
    const ctx = memoryContext({ businesses: [client('soon', 3), client('due', 0), client('later', 5)] });
    const result = await subscriptionReminders(ctx);
    expect(result).toMatchObject({ sent: 2, failed: 0 });
    const texts = ctx.notifyMock.mails.map((m) => `${m.to}|${m.text}`);
    expect(texts.find((t) => t.startsWith('due@'))).toContain('сегодня');
    expect(texts.find((t) => t.startsWith('soon@'))).toContain(moscowDate(TEST_NOW, 3));
  });

  it('повторный запуск в следующие дни не дублирует «за 3 дня» (раньше — письмо каждый день)', async () => {
    const ctx = memoryContext({ businesses: [client('soon', 3)] });
    await subscriptionReminders(ctx);
    const nextDay = memoryContext({ businesses: [client('soon', 3)], cron_marks: ctx.mem.tables.cron_marks ?? [] }, {
      now: new Date(TEST_NOW.getTime() + 86_400_000),
    });
    await subscriptionReminders(nextDay);
    expect(ctx.notifyMock.mails.length + nextDay.notifyMock.mails.length).toBe(1);
  });

  it('продление (новая subscription_until) → новое напоминание', async () => {
    const ctx = memoryContext({ businesses: [client('x', 3)] });
    await subscriptionReminders(ctx);
    const row = ctx.mem.tables.businesses?.[0];
    if (row !== undefined) row.subscription_until = moscowDate(TEST_NOW, 2);
    await subscriptionReminders(ctx);
    expect(ctx.notifyMock.mails.length).toBe(2);
  });

  it('просрочка > 7 дней → заглушка, > 30 дней → archived; повтор ничего не меняет', async () => {
    const ctx = memoryContext({ businesses: [client('late7', -8), client('late30', -31), client('late3', -3)] });
    const first = await subscriptionReminders(ctx);
    expect(first).toMatchObject({ stubbed: 2, archived: 1 });
    const rows = ctx.mem.tables.businesses ?? [];
    expect(rows.find((b) => b.id === 'late3')?.subscription_active).toBe(true);
    expect(rows.find((b) => b.id === 'late30')?.status).toBe('archived');
    const second = await subscriptionReminders(ctx);
    expect(second).toMatchObject({ stubbed: 0, archived: 0 });
  });

  it('сбой SMTP → ключ освобождён, письмо повторится', async () => {
    const ctx = memoryContext({ businesses: [client('due', 0)] }, { mailThrows: true });
    const result = await subscriptionReminders(ctx);
    expect(result.failed).toBe(1);
    expect(ctx.mem.tables.cron_marks?.length).toBe(0);
  });

  it('ошибка БД → исключение', async () => {
    const ctx = memoryContext({}, { failOn: (q) => (q.table === 'businesses' ? 'boom' : null) });
    await expect(subscriptionReminders(ctx)).rejects.toThrow('boom');
  });
});

describe('subscription-reminders: бюджет времени', () => {
  it('время вышло — письма не уходят, захваченные ключи освобождаются (повтор следующим запуском)', async () => {
    const ctx = memoryContext({ businesses: [client('due', 0), client('soon', 2)] }, { budgetMs: -1 });
    const result = await subscriptionReminders(ctx);
    expect(result).toMatchObject({ sent: 0, failed: 2 });
    expect(ctx.notifyMock.mails.length).toBe(0);
    expect(ctx.mem.tables.cron_marks?.length).toBe(0);
  });
});

describe('subscription-reminders и выкуп кода (§14.4)', () => {
  it('выкупивший код: ни письма «продлите», ни заглушки, ни архива — его ведёт process-transfers', async () => {
    const transferred = { code_transferred_at: '2026-01-01T00:00:00Z' };
    const ctx = memoryContext({
      businesses: [client('soon', 2, transferred), client('late', -8, transferred), client('old', -31, transferred)],
    });
    const result = await subscriptionReminders(ctx);
    expect(result).toMatchObject({ sent: 0, stubbed: 0, archived: 0 });
    expect(ctx.notifyMock.mails.length).toBe(0);
    expect(ctx.mem.tables.businesses?.every((b) => b.status === 'client' && b.subscription_active === true)).toBe(true);
  });
});
