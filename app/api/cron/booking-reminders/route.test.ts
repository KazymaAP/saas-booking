// app/api/cron/booking-reminders/route.test.ts — напоминания клиентам: оба окна за вызов, без повторов, без отменённых.
import { describe, expect, it } from 'vitest';
import { bookingReminders } from '@/lib/cron-jobs/booking-reminders';
import { TEST_NOW } from '@/lib/test-utils/supabase-mock';
import { hoursFrom, memoryContext } from '@/lib/test-utils/context';
import type { Row } from '@/lib/test-utils/memory-db';

const BUSINESS: Row = { id: 'b1', name: 'Студия', address: 'ул. Ленина, 1', telegram_chat_id: 'tg-1' };
const SERVICE: Row = { id: 's1', name: 'Стрижка' };

function booking(id: string, hours: number, extra: Row = {}): Row {
  return {
    id, business_id: 'b1', service_id: 's1', status: 'confirmed', client_email: `${id}@client.test`,
    scheduled_at: hoursFrom(TEST_NOW, hours), reminder_24h_sent_at: null, reminder_2h_sent_at: null, ...extra,
  };
}

function tables(bookings: Row[]): Record<string, Row[]> {
  return { bookings, businesses: [{ ...BUSINESS }], services: [{ ...SERVICE }] };
}

describe('booking-reminders', () => {
  it('3 брони → 2 письма: 24 ч и 2 ч уходят за один вызов, отменённая — нет', async () => {
    const ctx = memoryContext(tables([
      booking('a', 24),
      booking('b', 2),
      booking('c', 24, { status: 'cancelled' }),
    ]));
    const result = await bookingReminders(ctx);
    expect(ctx.notifyMock.mails.map((m) => m.to).sort()).toEqual(['a@client.test', 'b@client.test']);
    expect(result).toMatchObject({ sent_24h: 1, sent_2h: 1, failed_24h: 0, failed_2h: 0 });
    expect(ctx.mem.tables.bookings?.find((b) => b.id === 'c')?.reminder_24h_sent_at).toBeNull();
  });

  it('повторный запуск не отправляет повторно (отметка reminder_*_sent_at)', async () => {
    const ctx = memoryContext(tables([booking('a', 24), booking('b', 2)]));
    await bookingReminders(ctx);
    await bookingReminders(ctx);
    expect(ctx.notifyMock.mails.length).toBe(2);
    const a = ctx.mem.tables.bookings?.find((b) => b.id === 'a');
    expect(a?.reminder_24h_sent_at).toBe(TEST_NOW.toISOString());
  });

  it('границы окон: [23 ч, 25 ч) и [1 ч, 3 ч) — включая нижнюю, исключая верхнюю', async () => {
    const ctx = memoryContext(tables([
      booking('in-23', 23), booking('out-25', 25), booking('out-22', 22.9),
      booking('in-1', 1), booking('out-3', 3), booking('out-0', 0.5),
    ]));
    await bookingReminders(ctx);
    expect(ctx.notifyMock.mails.map((m) => m.to).sort()).toEqual(['in-1@client.test', 'in-23@client.test']);
  });

  it('статус new тоже напоминается; no_show/done — нет', async () => {
    const ctx = memoryContext(tables([
      booking('n', 24, { status: 'new' }), booking('d', 24, { status: 'done' }), booking('x', 2, { status: 'no_show' }),
    ]));
    await bookingReminders(ctx);
    expect(ctx.notifyMock.mails.map((m) => m.to)).toEqual(['n@client.test']);
  });

  it('сбой SMTP → отметка снимается (повтор через час), ошибка в журнале без адреса клиента', async () => {
    const ctx = memoryContext(tables([booking('a', 24)]), { mailThrows: true });
    const result = await bookingReminders(ctx);
    expect(result.failed_24h).toBe(1);
    expect(ctx.mem.tables.bookings?.[0]?.reminder_24h_sent_at).toBeNull();
    expect(ctx.logMock.errors[0]?.message).toContain('smtp down');
    expect(JSON.stringify(ctx.logMock.errors)).not.toContain('@client.test');
  });

  it('без email клиента: отметка ставится, письма нет; бизнесу за 2 ч — Telegram', async () => {
    const ctx = memoryContext(tables([booking('a', 2, { client_email: null })]));
    const result = await bookingReminders(ctx);
    expect(result).toMatchObject({ no_email_2h: 1, sent_2h: 0 });
    expect(ctx.notifyMock.mails.length).toBe(0);
    expect(ctx.notifyMock.telegrams[0]?.chatId).toBe('tg-1');
    expect(ctx.mem.tables.bookings?.[0]?.reminder_2h_sent_at).not.toBeNull();
  });

  it('текст: услуга, время по Москве, адрес бизнеса', async () => {
    const ctx = memoryContext(tables([booking('a', 24)]));
    await bookingReminders(ctx);
    const text = ctx.notifyMock.mails[0]?.text ?? '';
    expect(text).toContain('Стрижка');
    expect(text).toContain('Студия, ул. Ленина, 1');
    expect(text).toContain('завтра');
  });

  it('ошибка БД при выборке → исключение (runCronJob превратит в 500 + logError)', async () => {
    const ctx = memoryContext({}, { failOn: (q) => (q.table === 'bookings' ? 'timeout' : null) });
    await expect(bookingReminders(ctx)).rejects.toThrow('timeout');
  });
});

describe('booking-reminders: бюджет времени', () => {
  it('время вышло до начала — ни одной брони не захвачено, отметки не тронуты', async () => {
    const ctx = memoryContext(tables([booking('a', 24), booking('b', 2)]), { budgetMs: -1 });
    const result = await bookingReminders(ctx);
    expect(result).toMatchObject({ claimed_24h: 0, claimed_2h: 0 });
    expect(ctx.mem.tables.bookings?.every((b) => b.reminder_24h_sent_at === null && b.reminder_2h_sent_at === null)).toBe(true);
  });
});

describe('booking-reminders: сбой БД после захвата', () => {
  it('справочники не прочитались → отметки сняты, исключение наружу, следующий запуск отправит', async () => {
    const ctx = memoryContext(tables([booking('a', 24)]), {
      failOn: (q) => (q.table === 'businesses' && q.op === 'select' ? 'connection reset' : null),
    });
    await expect(bookingReminders(ctx)).rejects.toThrow('connection reset');
    expect(ctx.mem.tables.bookings?.[0]?.reminder_24h_sent_at).toBeNull();
    expect(ctx.notifyMock.mails.length).toBe(0);
  });
});

describe('booking-reminders: несколько порций', () => {
  it('120 броней в окне 24 ч → все получают письмо за один запуск (порции по 50), повтор — 0', async () => {
    const many = Array.from({ length: 120 }, (_, i) => booking(`m${i}`, 23.5 + i / 1000));
    const ctx = memoryContext(tables(many));
    const result = await bookingReminders(ctx);
    expect(result).toMatchObject({ claimed_24h: 120, sent_24h: 120, failed_24h: 0 });
    expect(new Set(ctx.notifyMock.mails.map((m) => m.to)).size).toBe(120);
    expect((await bookingReminders(ctx)).claimed_24h).toBe(0);
  });
});
