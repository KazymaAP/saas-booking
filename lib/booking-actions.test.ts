// lib/booking-actions.test.ts — отмена и перенос по токену с in-memory фейком bookings (без сети и БД).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { id: string; cancel_token: string; status: string; scheduled_at: string };
type DbError = { code?: string; message: string } | null;

const state: {
  bookings: Map<string, Row>;
  business: Record<string, unknown>;
  service: Record<string, unknown> | null;
  notified: string[];
  audits: string[];
  auditCount: number;
  updateError: DbError;
  dropRescheduleCount: boolean;
} = {
  bookings: new Map(),
  business: {},
  service: null,
  notified: [],
  audits: [],
  auditCount: 0,
  updateError: null,
  dropRescheduleCount: false,
};

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

// Минимальный PostgREST-билдер: eq/in/neq/gte/lt/limit накапливают фильтры, then/maybeSingle/select исполняют.
function builder(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  let patch: Record<string, unknown> | null = null;
  const matches = (row: Row) =>
    filters.every(([op, col, val]) => {
      if (op === 'eq') return row[col] === val;
      if (op === 'in') return (val as unknown[]).includes(row[col]);
      if (op === 'neq') return row[col] !== val;
      return true;
    });
  const api = {
    select: () => api,
    eq: (col: string, val: unknown) => (filters.push(['eq', col, val]), api),
    in: (col: string, val: unknown) => (filters.push(['in', col, val]), api),
    neq: (col: string, val: unknown) => (filters.push(['neq', col, val]), api),
    gte: () => api,
    lt: () => api,
    lte: () => api,
    limit: () => api,
    update: (value: Record<string, unknown>) => ((patch = value), api),
    async maybeSingle() {
      await tick();
      const row = [...state.bookings.values()].find(matches);
      if (row === undefined) return { data: null, error: null };
      return {
        data: { ...row, services: state.service, businesses: state.business },
        error: null,
      };
    },
    then(resolve: (value: { data: unknown; error: DbError; count?: number }) => void) {
      tick().then(() => {
        if (table === 'audit_log') return resolve({ data: null, error: null, count: state.auditCount });
        if (table === 'business_holidays') return resolve({ data: [], error: null });
        if (patch === null) {
          const rows = [...state.bookings.values()].filter((r) => r.status === 'new' || r.status === 'confirmed');
          return resolve({ data: rows.map((r) => ({ ...r, services: state.service })), error: null });
        }
        if (state.dropRescheduleCount && 'reschedule_count' in patch) {
          return resolve({ data: null, error: { code: 'PGRST204', message: 'no column reschedule_count' } });
        }
        if (state.updateError) return resolve({ data: null, error: state.updateError });
        const hit = [...state.bookings.values()].filter(matches);
        for (const row of hit) state.bookings.set(row.id, { ...row, ...patch });
        return resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      });
    },
  };
  return api;
}

vi.mock('./supabase', () => ({ adminClient: () => ({ from: (table: string) => builder(table) }) }));
vi.mock('./booking-notify', () => ({
  notifyChanged: async (_b: string, event: string, id: string) => {
    state.notified.push(`${event}:${id}`);
  },
}));
vi.mock('./audit', () => ({
  audit: async (action: string) => {
    state.audits.push(action);
  },
}));
vi.mock('./log', () => ({ logError: async () => undefined }));

const { cancelBooking, rescheduleBooking, withinCancelWindow, bookingByToken } = await import('./booking-actions');

const TOKEN = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NOW = Date.parse('2026-10-15T06:00:00Z'); // 09:00 МСК, четверг
const BOOKED = '2026-10-19T07:00:00.000Z'; // пн 10:00 МСК
const NEW_TIME = '2026-10-19T09:00:00.000Z'; // пн 12:00 МСК

function seed(overrides: Partial<Row> = {}): void {
  state.bookings = new Map([
    ['bk1', { id: 'bk1', business_id: 'b1', cancel_token: TOKEN, status: 'new', scheduled_at: BOOKED, reschedule_count: 0, ...overrides }],
  ]);
}

beforeEach(() => {
  state.business = {
    id: 'b1', name: 'Студия', phones: ['+79990001122'], cancel_hours_before: 3, max_reschedules: 1,
    timezone: 'Europe/Moscow', working_hours: { mon: [{ open: '10:00', close: '18:00' }] },
    slot_step_minutes: 60, min_hours_before: 2, max_days_ahead: 30,
  };
  state.service = { name: 'Стрижка', duration_minutes: 60, buffer_before: 0, buffer_after: 0 };
  state.notified = [];
  state.audits = [];
  state.auditCount = 0;
  state.updateError = null;
  state.dropRescheduleCount = false;
  seed();
});

describe('cancelBooking', () => {
  it('отменяет активную бронь и уведомляет бизнес один раз', async () => {
    const result = await cancelBooking(TOKEN, NOW);
    expect(result).toEqual({ ok: true, value: { ok: true, status: 'cancelled' } });
    expect(state.bookings.get('bk1')).toMatchObject({ status: 'cancelled', cancelled_by: 'client' });
    expect(state.notified).toEqual(['cancel:bk1']);
    expect(state.audits).toEqual(['booking_cancelled']);
  });

  it('повторная отмена — ok + already, без второго уведомления', async () => {
    await cancelBooking(TOKEN, NOW);
    const again = await cancelBooking(TOKEN, NOW);
    expect(again).toEqual({ ok: true, value: { ok: true, status: 'cancelled', already: true } });
    expect(state.notified).toHaveLength(1);
  });

  it('параллельные отмены — одно уведомление', async () => {
    const results = await Promise.all([cancelBooking(TOKEN, NOW), cancelBooking(TOKEN, NOW), cancelBooking(TOKEN, NOW)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(state.notified).toHaveLength(1);
  });

  it('меньше cancel_hours_before → too_late с телефоном', async () => {
    const late = Date.parse(BOOKED) - 2 * 3_600_000;
    expect(await cancelBooking(TOKEN, late)).toEqual({ ok: false, failure: { reason: 'too_late', phone: '+79990001122' } });
    expect(state.bookings.get('bk1')?.status).toBe('new');
  });

  it('граница: ровно cancel_hours_before — ещё можно', async () => {
    const edge = Date.parse(BOOKED) - 3 * 3_600_000;
    expect((await cancelBooking(TOKEN, edge)).ok).toBe(true);
  });

  it('неизвестный токен → not_found; завершённая → not_cancellable', async () => {
    expect(await cancelBooking('11111111-1111-4111-8111-111111111111', NOW)).toEqual({ ok: false, failure: { reason: 'not_found' } });
    seed({ status: 'done' });
    expect(await cancelBooking(TOKEN, NOW)).toEqual({ ok: false, failure: { reason: 'not_cancellable' } });
  });

  it('ошибка БД при UPDATE пробрасывается (route вернёт 500)', async () => {
    state.updateError = { code: '08006', message: 'down' };
    await expect(cancelBooking(TOKEN, NOW)).rejects.toThrow('cancel update');
  });
});

describe('rescheduleBooking', () => {
  const input = { date: '2026-10-19', startsAt: NEW_TIME };

  it('переносит, сбрасывает напоминания и увеличивает счётчик', async () => {
    seed({ reminder_24h_sent_at: '2026-10-18T07:00:00Z', reminder_2h_sent_at: null });
    const result = await rescheduleBooking(TOKEN, input, NOW);
    expect(result).toEqual({ ok: true, value: { ok: true, status: 'new', startsAt: NEW_TIME } });
    expect(state.bookings.get('bk1')).toMatchObject({
      scheduled_at: NEW_TIME, reminder_24h_sent_at: null, reminder_2h_sent_at: null, reschedule_count: 1,
    });
    expect(state.notified).toEqual(['reschedule:bk1']);
  });

  it('повтор на то же время — already, без изменений и уведомлений', async () => {
    await rescheduleBooking(TOKEN, input, NOW);
    const again = await rescheduleBooking(TOKEN, input, NOW);
    expect(again).toMatchObject({ ok: true, value: { already: true } });
    expect(state.notified).toHaveLength(1);
  });

  it('max_reschedules исчерпан → reschedule_limit с телефоном', async () => {
    seed({ reschedule_count: 1 });
    expect(await rescheduleBooking(TOKEN, input, NOW)).toEqual({
      ok: false, failure: { reason: 'reschedule_limit', phone: '+79990001122' },
    });
  });

  it('старая схема без reschedule_count: счёт по audit_log', async () => {
    seed({ reschedule_count: undefined });
    state.auditCount = 1;
    expect(await rescheduleBooking(TOKEN, input, NOW)).toMatchObject({ ok: false, failure: { reason: 'reschedule_limit' } });
    state.auditCount = 0;
    state.dropRescheduleCount = true;
    expect(await rescheduleBooking(TOKEN, input, NOW)).toMatchObject({ ok: true });
    expect(state.bookings.get('bk1')?.scheduled_at).toBe(NEW_TIME);
  });

  it('поздно → too_late; не активна → not_reschedulable', async () => {
    const late = Date.parse(BOOKED) - 3_600_000;
    expect(await rescheduleBooking(TOKEN, input, late)).toMatchObject({ ok: false, failure: { reason: 'too_late' } });
    seed({ status: 'cancelled' });
    expect(await rescheduleBooking(TOKEN, input, NOW)).toMatchObject({ ok: false, failure: { reason: 'not_reschedulable' } });
  });

  it('время вне рабочих часов или занятое → slot_taken', async () => {
    expect(await rescheduleBooking(TOKEN, { date: '2026-10-19', startsAt: '2026-10-19T16:00:00.000Z' }, NOW)).toMatchObject({
      ok: false, failure: { reason: 'slot_taken' },
    });
    state.bookings.set('bk2', { id: 'bk2', business_id: 'b1', cancel_token: 'other', status: 'confirmed', scheduled_at: NEW_TIME });
    expect(await rescheduleBooking(TOKEN, input, NOW)).toMatchObject({ ok: false, failure: { reason: 'slot_taken' } });
  });

  it('дата не совпадает с днём слота → validation', async () => {
    expect(await rescheduleBooking(TOKEN, { date: '2026-10-20', startsAt: NEW_TIME }, NOW)).toMatchObject({
      ok: false, failure: { reason: 'validation', field: 'startsAt' },
    });
  });

  it('конфликт на уровне БД (23P01) → slot_taken', async () => {
    state.updateError = { code: '23P01', message: 'exclusion' };
    expect(await rescheduleBooking(TOKEN, input, NOW)).toMatchObject({ ok: false, failure: { reason: 'slot_taken' } });
  });

  it('бронь изменили конкурентно (0 строк) → not_reschedulable', async () => {
    const original = state.bookings.get('bk1');
    const raced = rescheduleBooking(TOKEN, input, NOW);
    // Пока идут проверки, бизнес отменяет бронь в кабинете.
    await tick();
    await tick();
    if (original) state.bookings.set('bk1', { ...original, status: 'cancelled' });
    expect(await raced).toMatchObject({ ok: false, failure: { reason: 'not_reschedulable' } });
  });
});

describe('вспомогательные', () => {
  it('withinCancelWindow не зависит от пояса: абсолютное время', async () => {
    const booking = await bookingByToken(TOKEN);
    expect(booking).not.toBeNull();
    if (booking === null) return;
    expect(withinCancelWindow(booking, Date.parse(BOOKED) - 3 * 3_600_000)).toBe(true);
    expect(withinCancelWindow(booking, Date.parse(BOOKED) - 3 * 3_600_000 + 1)).toBe(false);
    state.business = { ...state.business, timezone: 'Asia/Vladivostok' };
    const far = await bookingByToken(TOKEN);
    if (far) expect(withinCancelWindow(far, Date.parse(BOOKED) - 3 * 3_600_000)).toBe(true);
  });

  it('дефолты: cancel_hours_before=3, max_reschedules=1 при null', async () => {
    state.business = { ...state.business, cancel_hours_before: null, max_reschedules: null };
    expect(await cancelBooking(TOKEN, Date.parse(BOOKED) - 2 * 3_600_000)).toMatchObject({ failure: { reason: 'too_late' } });
    seed({ reschedule_count: 1 });
    expect(await rescheduleBooking(TOKEN, { date: '2026-10-19', startsAt: NEW_TIME }, NOW)).toMatchObject({
      failure: { reason: 'reschedule_limit' },
    });
  });
});
