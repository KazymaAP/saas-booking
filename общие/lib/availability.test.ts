// lib/availability.test.ts — занятость и слоты с mock Supabase (без сети и БД).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { code?: string; message: string } | null };
type Call = { table: string; ops: Array<[string, unknown[]]> };

const state: { calls: Call[]; results: Record<string, Result> } = { calls: [], results: {} };

// Цепочка PostgREST: любые методы фильтров возвращают себя, await отдаёт заранее заданный результат таблицы.
function chain(table: string): Record<string, unknown> {
  const call: Call = { table, ops: [] };
  state.calls.push(call);
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'then') {
        const res = state.results[table] ?? { data: [], error: null };
        return (resolve: (v: Result) => void) => resolve(res);
      }
      return (...args: unknown[]) => {
        call.ops.push([prop, args]);
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('./supabase', () => ({ adminClient: () => ({ from: (table: string) => chain(table) }) }));

const { busyForDay, freeSlotsFor, holidaysBetween, businessTimeZone, bookingDurationMinutes } = await import('./availability');

const NOW = Date.parse('2026-10-15T06:00:00Z');
const BUSINESS = {
  id: 'b1',
  working_hours: { mon: [{ open: '10:00', close: '14:00' }] },
  slot_step_minutes: 60,
  min_hours_before: 2,
  max_days_ahead: 30,
};

beforeEach(() => {
  state.calls = [];
  state.results = {};
});

describe('busyForDay', () => {
  it('пустой день — пустой массив, фильтры по бизнесу/статусу/окну ±1 день', async () => {
    const busy = await busyForDay('b1', '2026-10-19');
    expect(busy).toEqual([]);
    const ops = state.calls[0].ops;
    expect(state.calls[0].table).toBe('bookings');
    expect(ops).toContainEqual(['eq', ['business_id', 'b1']]);
    expect(ops).toContainEqual(['in', ['status', ['new', 'confirmed']]]);
    expect(ops).toContainEqual(['gte', ['scheduled_at', '2026-10-17T21:00:00.000Z']]);
    expect(ops).toContainEqual(['lt', ['scheduled_at', '2026-10-20T21:00:00.000Z']]);
    expect(ops.some(([m]) => m === 'limit')).toBe(true);
    expect(ops.some(([m]) => m === 'neq')).toBe(false);
  });

  it('исключает бронь при переносе', async () => {
    await busyForDay('b1', '2026-10-19', 'bk1');
    expect(state.calls[0].ops).toContainEqual(['neq', ['id', 'bk1']]);
  });

  it('длительность: duration_at_booking → услуга → 60 мин; буферы услуги', async () => {
    state.results.bookings = {
      error: null,
      data: [
        { id: '1', scheduled_at: '2026-10-19T07:00:00Z', duration_at_booking: 30, services: { duration_minutes: 90 } },
        { id: '2', scheduled_at: '2026-10-19T08:00:00Z', services: { duration_minutes: 90, buffer_before: 5, buffer_after: 10 } },
        { id: '3', scheduled_at: '2026-10-19T10:00:00Z', services: null },
        { id: 'bad', scheduled_at: 42 },
      ],
    };
    const busy = await busyForDay('b1', '2026-10-19');
    expect(busy).toHaveLength(3);
    expect(busy[0].end - busy[0].start).toBe(30 * 60_000);
    expect(busy[1]).toMatchObject({ bufferBefore: 5, bufferAfter: 10 });
    expect(busy[1].end - busy[1].start).toBe(90 * 60_000);
    expect(busy[2].end - busy[2].start).toBe(60 * 60_000);
  });

  it('ошибка БД пробрасывается, а не превращается в «всё свободно»', async () => {
    state.results.bookings = { data: null, error: { code: '57014', message: 'timeout' } };
    await expect(busyForDay('b1', '2026-10-19')).rejects.toThrow(/timeout/);
  });

  it('data = null без ошибки — пусто', async () => {
    state.results.bookings = { data: null, error: null };
    expect(await busyForDay('b1', '2026-10-19')).toEqual([]);
  });

  it('невалидная дата — пусто без запроса', async () => {
    expect(await busyForDay('b1', 'bad')).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });
});

describe('holidaysBetween', () => {
  it('возвращает даты', async () => {
    state.results.business_holidays = { data: [{ date: '2026-10-19' }, { nope: 1 }], error: null };
    expect(await holidaysBetween('b1', '2026-10-19', '2026-10-19')).toEqual(['2026-10-19']);
  });

  it('таблицы нет (старая схема) — пусто', async () => {
    state.results.business_holidays = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
    expect(await holidaysBetween('b1', '2026-10-19', '2026-10-19')).toEqual([]);
    state.results.business_holidays = { data: null, error: { code: 'PGRST205', message: 'not in schema cache' } };
    expect(await holidaysBetween('b1', '2026-10-19', '2026-10-19')).toEqual([]);
  });

  it('другая ошибка пробрасывается', async () => {
    state.results.business_holidays = { data: null, error: { message: 'boom' } };
    await expect(holidaysBetween('b1', '2026-10-19', '2026-10-19')).rejects.toThrow(/boom/);
  });

  it('data = null без ошибки — пусто', async () => {
    state.results.business_holidays = { data: null, error: null };
    expect(await holidaysBetween('b1', '2026-10-19', '2026-10-19')).toEqual([]);
  });
});

describe('freeSlotsFor', () => {
  it('пустой день — все слоты', async () => {
    const slots = await freeSlotsFor(BUSINESS, { duration_minutes: 60 }, '2026-10-19', { nowMs: NOW });
    expect(slots).toHaveLength(4);
  });

  it('полный день — ни одного слота', async () => {
    state.results.bookings = {
      error: null,
      data: [{ id: '1', scheduled_at: '2026-10-19T07:00:00Z', duration_at_booking: 240 }],
    };
    expect(await freeSlotsFor(BUSINESS, { duration_minutes: 60 }, '2026-10-19', { nowMs: NOW })).toEqual([]);
  });

  it('выходной из business_holidays — пусто', async () => {
    state.results.business_holidays = { data: [{ date: '2026-10-19' }], error: null };
    expect(await freeSlotsFor(BUSINESS, { duration_minutes: 60 }, '2026-10-19', { nowMs: NOW })).toEqual([]);
  });

  it('буферы услуги учитываются', async () => {
    state.results.bookings = { error: null, data: [{ id: '1', scheduled_at: '2026-10-19T09:00:00Z', duration_at_booking: 60 }] };
    const slots = await freeSlotsFor(BUSINESS, { duration_minutes: 60, buffer_after: 15 }, '2026-10-19', { nowMs: NOW });
    expect(slots.map((ms) => new Date(ms).toISOString())).toEqual(['2026-10-19T07:00:00.000Z', '2026-10-19T10:00:00.000Z']);
  });

  it('старая сигнатура: 4-й аргумент строкой = excludeBookingId; nowMs по умолчанию Date.now', async () => {
    await freeSlotsFor(BUSINESS, { duration_minutes: 60 }, '2026-10-19', 'bk1');
    expect(state.calls.find((c) => c.table === 'bookings')?.ops).toContainEqual(['neq', ['id', 'bk1']]);
  });

  it('занятость и выходные запрашиваются параллельно', async () => {
    await freeSlotsFor(BUSINESS, { duration_minutes: 60 }, '2026-10-19', { nowMs: NOW });
    expect(state.calls.map((c) => c.table).sort()).toEqual(['bookings', 'business_holidays']);
  });

  it('timezone бизнеса используется', async () => {
    const slots = await freeSlotsFor({ ...BUSINESS, timezone: 'Asia/Yekaterinburg' }, { duration_minutes: 60 }, '2026-10-19', { nowMs: NOW });
    expect(new Date(slots[0]).toISOString()).toBe('2026-10-19T05:00:00.000Z');
  });
});

describe('хелперы', () => {
  it('businessTimeZone', () => {
    expect(businessTimeZone({ timezone: 'Asia/Omsk' })).toBe('Asia/Omsk');
    expect(businessTimeZone({ timezone: 'bad/zone' })).toBe('Europe/Moscow');
    expect(businessTimeZone({ timezone: null })).toBe('Europe/Moscow');
    expect(businessTimeZone({})).toBe('Europe/Moscow');
  });

  it('bookingDurationMinutes', () => {
    expect(bookingDurationMinutes({ duration_at_booking: 45, services: { duration_minutes: 90 } })).toBe(45);
    expect(bookingDurationMinutes({ services: { duration_minutes: 90 } })).toBe(90);
    expect(bookingDurationMinutes({})).toBe(60);
  });
});
