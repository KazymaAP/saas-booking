// app/api/cron/unconfirmed-reminder/route.test.ts — висящие брони (status=new > 24 ч): одно письмо на бизнес, без повторов.
import { describe, expect, it } from 'vitest';
import { unconfirmedReminder } from '@/lib/cron-jobs/unconfirmed-reminder';
import { TEST_NOW } from '@/lib/test-utils/supabase-mock';
import { hoursFrom, memoryContext } from '@/lib/test-utils/context';
import type { MemoryDb, Row } from '@/lib/test-utils/memory-db';

const DAY_HOURS = 24;

// Зеркало public.cron_claim_unconfirmed из 0006_pg_cron.sql: выбор + захват в cron_marks.
function claimUnconfirmed(args: Row, db: MemoryDb): string[] {
  const marks = (db.tables.cron_marks ??= []);
  const limit = Number(args.p_limit);
  const due = (db.tables.bookings ?? []).filter((b) => b.status === 'new'
    && String(b.created_at) < hoursFrom(TEST_NOW, -DAY_HOURS) && String(b.scheduled_at) > TEST_NOW.toISOString()
    && marks.some((m) => m.job === 'unconfirmed-reminder' && m.key === b.id) === false).slice(0, limit);
  for (const b of due) marks.push({ job: 'unconfirmed-reminder', key: b.id, created_at: TEST_NOW.toISOString() });
  return due.map((b) => String(b.id));
}

function booking(id: string, businessId: string, createdHoursAgo: number, extra: Row = {}): Row {
  return {
    id, business_id: businessId, status: 'new', created_at: hoursFrom(TEST_NOW, -createdHoursAgo),
    scheduled_at: hoursFrom(TEST_NOW, 48), ...extra,
  };
}

function setup(bookings: Row[], options: { mailThrows?: boolean } = {}) {
  return memoryContext({
    bookings,
    businesses: [
      { id: 'b1', name: 'Студия', emails: ['owner@b1.test'], telegram_chat_id: null },
      { id: 'b2', name: 'Без контактов', emails: [], telegram_chat_id: null },
    ],
  }, { ...options, rpc: { cron_claim_unconfirmed: claimUnconfirmed } });
}

describe('unconfirmed-reminder', () => {
  it('две висящие брони бизнеса → одно письмо; свежая и подтверждённая не учитываются', async () => {
    const ctx = setup([
      booking('k1', 'b1', 30), booking('k2', 'b1', 25), booking('fresh', 'b1', 2), booking('ok', 'b1', 30, { status: 'confirmed' }),
    ]);
    const result = await unconfirmedReminder(ctx);
    expect(result).toMatchObject({ claimed: 2, notified: 1, failed: 0 });
    expect(ctx.notifyMock.mails.length).toBe(1);
    expect(ctx.notifyMock.mails[0]?.text).toContain('2 брон.');
  });

  it('повторный запуск через час — письма нет (идемпотентность)', async () => {
    const ctx = setup([booking('k1', 'b1', 30)]);
    await unconfirmedReminder(ctx);
    const second = await unconfirmedReminder(ctx);
    expect(second.claimed).toBe(0);
    expect(ctx.notifyMock.mails.length).toBe(1);
  });

  it('сбой SMTP → ключ освобождён, следующий запуск отправит', async () => {
    const ctx = setup([booking('k1', 'b1', 30)], { mailThrows: true });
    const result = await unconfirmedReminder(ctx);
    expect(result.failed).toBe(1);
    expect(ctx.mem.tables.cron_marks?.length).toBe(0);
    expect(ctx.logMock.errors.length).toBe(1);
  });

  it('бизнес без email и Telegram → no_contact, отметка остаётся', async () => {
    const ctx = setup([booking('k1', 'b2', 30)]);
    const result = await unconfirmedReminder(ctx);
    expect(result).toMatchObject({ no_contact: 1, failed: 0 });
    expect(ctx.mem.tables.cron_marks?.length).toBe(1);
  });

  it('ошибка RPC → исключение', async () => {
    const ctx = memoryContext({}, { failOn: (q) => (q.table === 'rpc:cron_claim_unconfirmed' ? 'no function' : null) });
    await expect(unconfirmedReminder(ctx)).rejects.toThrow('no function');
  });

  it('сбой БД после захвата (чтение броней) → ключи освобождены, исключение наружу', async () => {
    const ctx = memoryContext({ bookings: [booking('k1', 'b1', 30)], businesses: [] }, {
      rpc: { cron_claim_unconfirmed: claimUnconfirmed },
      failOn: (q) => (q.table === 'bookings' && q.op === 'select' ? 'connection reset' : null),
    });
    await expect(unconfirmedReminder(ctx)).rejects.toThrow('connection reset');
    expect(ctx.mem.tables.cron_marks?.length).toBe(0);
  });
});
