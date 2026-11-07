// lib/rate-limit.test.ts — атомарный rate limit: границы окна, лимит 5/600, сброс, конкурентные вызовы.
// Supabase заменён in-memory фейком таблицы rate_limits. Каждая операция фейка асинхронна (setImmediate),
// поэтому Promise.all реально перемешивает чтения и записи конкурентных вызовов — как в Postgres.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { bucket: string; window_start: string; hits: number };
type DbError = { code?: string; message: string } | null;
type Mode = 'rpc' | 'cas' | 'broken';

const db: { rows: Map<string, Row>; mode: Mode; rpcCalls: number; logs: unknown[][] } = {
  rows: new Map(),
  mode: 'rpc',
  rpcCalls: 0,
  logs: [],
};

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const MISSING_FN: DbError = { code: 'PGRST202', message: 'function not found' };
const BROKEN: DbError = { code: '08006', message: 'connection failure' };

// Эталон SQL-функции rate_limit_hit: один «атомарный» шаг без await внутри.
function sqlRateLimitHit(bucket: string, limit: number, windowSeconds: number) {
  const nowMs = Date.now();
  const row = db.rows.get(bucket);
  const expired = row === undefined || Date.parse(row.window_start) <= nowMs - windowSeconds * 1000;
  const next: Row = expired
    ? { bucket, window_start: new Date(nowMs).toISOString(), hits: 1 }
    : { ...row, hits: row.hits + 1 };
  db.rows.set(bucket, next);
  const retry = Math.max(0, Math.ceil((Date.parse(next.window_start) + windowSeconds * 1000 - nowMs) / 1000));
  return [{ allowed: next.hits <= limit, hits: next.hits, retry_after: retry }];
}

function selectBuilder() {
  const filters: Record<string, unknown> = {};
  const builder = {
    eq(column: string, value: unknown) {
      filters[column] = value;
      return builder;
    },
    async maybeSingle(): Promise<{ data: Row | null; error: DbError }> {
      await tick();
      if (db.mode === 'broken') return { data: null, error: BROKEN };
      const row = db.rows.get(String(filters.bucket));
      return { data: row === undefined ? null : { ...row }, error: null };
    },
  };
  return builder;
}

function updateBuilder(patch: Partial<Row>) {
  const filters: Record<string, unknown> = {};
  const builder = {
    eq(column: string, value: unknown) {
      filters[column] = value;
      return builder;
    },
    async select(): Promise<{ data: Pick<Row, 'hits'>[] | null; error: DbError }> {
      await tick();
      const row = db.rows.get(String(filters.bucket));
      const matches = row !== undefined && row.hits === filters.hits && row.window_start === filters.window_start;
      if (matches === false || row === undefined) return { data: [], error: null };
      const next = { ...row, ...patch };
      db.rows.set(row.bucket, next);
      return { data: [{ hits: next.hits }], error: null };
    },
  };
  return builder;
}

const fakeClient = {
  async rpc(name: string, args: { p_bucket: string; p_limit: number; p_window_seconds: number }) {
    db.rpcCalls += 1;
    await tick();
    if (db.mode === 'broken') return { data: null, error: BROKEN };
    if (db.mode === 'cas' || name !== 'rate_limit_hit') return { data: null, error: MISSING_FN };
    return { data: sqlRateLimitHit(args.p_bucket, args.p_limit, args.p_window_seconds), error: null };
  },
  from(table: string) {
    if (table === 'audit_log') {
      return {
        insert: (payload: unknown) => {
          db.logs.push([payload]);
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
    return {
      select: () => selectBuilder(),
      async insert(row: Row): Promise<{ data: null; error: DbError }> {
        await tick();
        if (db.rows.has(row.bucket)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        db.rows.set(row.bucket, { ...row });
        return { data: null, error: null };
      },
      update: (patch: Partial<Row>) => updateBuilder(patch),
    };
  },
};

vi.mock('./supabase', () => ({ adminClient: () => fakeClient }));

const { rateLimit, rateLimitScope, hitRateLimit, clientIp, RATE_LIMITS, scopeLimitFromSettings } = await import('./rate-limit');

const T0 = Date.parse('2026-10-15T10:00:00Z');
const BUCKET = 'booking:203.0.113.7';
const { limit: LIMIT, windowSeconds: WINDOW } = RATE_LIMITS.booking;

async function hitTimes(times: number): Promise<boolean[]> {
  const results: boolean[] = [];
  for (let i = 0; i < times; i += 1) {
    // Последовательно: проверяем порядок попаданий, а не конкуренцию.
    results.push((await rateLimit(BUCKET, LIMIT, WINDOW)).allowed);
  }
  return results;
}

beforeEach(() => {
  db.rows = new Map();
  db.rpcCalls = 0;
  db.logs = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

describe.each(['rpc', 'cas'] as const)('rateLimit (%s)', (mode) => {
  beforeEach(() => {
    db.mode = mode;
  });

  it('лимит 5/600: пять запросов проходят, шестой — нет', async () => {
    expect(await hitTimes(6)).toEqual([true, true, true, true, true, false]);
  });

  it('retryAfter после отказа — остаток окна', async () => {
    await hitTimes(5);
    vi.setSystemTime(T0 + 120_000);
    const denied = await rateLimit(BUCKET, LIMIT, WINDOW);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBe(WINDOW - 120);
  });

  it('граница окна: за 1 мс до конца ещё отказ, ровно на границе — сброс', async () => {
    await hitTimes(5);
    vi.setSystemTime(T0 + WINDOW * 1000 - 1);
    expect((await rateLimit(BUCKET, LIMIT, WINDOW)).allowed).toBe(false);
    vi.setSystemTime(T0 + WINDOW * 1000);
    const reset = await rateLimit(BUCKET, LIMIT, WINDOW);
    expect(reset).toMatchObject({ allowed: true, hits: 1 });
  });

  it('после сброса снова доступно ровно 5 попаданий', async () => {
    await hitTimes(6);
    vi.setSystemTime(T0 + WINDOW * 1000 + 5);
    expect(await hitTimes(6)).toEqual([true, true, true, true, true, false]);
  });

  it('разные bucket не влияют друг на друга', async () => {
    await hitTimes(5);
    expect((await rateLimit('booking:198.51.100.1', LIMIT, WINDOW)).allowed).toBe(true);
  });

  it('20 конкурентных вызовов: проходят ровно 5', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit(BUCKET, LIMIT, WINDOW)));
    expect(results.filter((r) => r.allowed)).toHaveLength(LIMIT);
  });

  it('конкурентные вызовы в истёкшем окне: сброс не «теряет» попадания', async () => {
    db.rows.set(BUCKET, { bucket: BUCKET, window_start: new Date(T0 - WINDOW * 1000).toISOString(), hits: 5 });
    const results = await Promise.all(Array.from({ length: 8 }, () => rateLimit(BUCKET, LIMIT, WINDOW)));
    expect(results.filter((r) => r.allowed)).toHaveLength(LIMIT);
    // Окно сброшено ровно один раз: старые 5 попаданий не суммируются с новыми.
    expect(db.rows.get(BUCKET)?.window_start).toBe(new Date(T0).toISOString());
    expect(db.rows.get(BUCKET)?.hits).toBeGreaterThanOrEqual(LIMIT);
    expect(db.rows.get(BUCKET)?.hits).toBeLessThanOrEqual(8);
  });
});

describe('rateLimit — особые случаи', () => {
  it('rpc-путь — один round-trip к БД', async () => {
    db.mode = 'rpc';
    await rateLimit(BUCKET, LIMIT, WINDOW);
    expect(db.rpcCalls).toBe(1);
  });

  it('битая дата окна в строке считается истёкшим окном (cas)', async () => {
    db.mode = 'cas';
    db.rows.set(BUCKET, { bucket: BUCKET, window_start: 'garbage', hits: 99 });
    expect(await rateLimit(BUCKET, LIMIT, WINDOW)).toMatchObject({ allowed: true, hits: 1 });
  });

  it('cas: бесконечная конкуренция → отказ, а не превышение лимита', async () => {
    db.mode = 'cas';
    db.rows.set(BUCKET, { bucket: BUCKET, window_start: new Date(T0).toISOString(), hits: 1 });
    const original = fakeClient.from;
    // Каждый UPDATE «проигрывает» гонку: строка меняется между чтением и записью.
    fakeClient.from = (table: string) => {
      const real = original(table);
      if (table !== 'rate_limits') return real;
      return {
        ...real,
        update: () => ({
          eq() {
            return this;
          },
          select: async () => ({ data: [], error: null }),
        }),
      } as ReturnType<typeof original>;
    };
    try {
      expect((await rateLimit(BUCKET, LIMIT, WINDOW)).allowed).toBe(false);
    } finally {
      fakeClient.from = original;
    }
  });

  it('БД недоступна → fail open и предупреждение в журнал без IP', async () => {
    db.mode = 'broken';
    const result = await rateLimit(BUCKET, LIMIT, WINDOW);
    expect(result.allowed).toBe(true);
    expect(JSON.stringify(db.logs)).toContain('rate_limit_unavailable');
    expect(JSON.stringify(db.logs)).not.toContain('203.0.113.7');
  });

  it('rpc вернул пустой ответ → fail open', async () => {
    db.mode = 'rpc';
    const original = fakeClient.rpc;
    fakeClient.rpc = async () => ({ data: [], error: null });
    try {
      expect((await rateLimit(BUCKET, LIMIT, WINDOW)).allowed).toBe(true);
      expect(JSON.stringify(db.logs)).toContain('пустой ответ');
    } finally {
      fakeClient.rpc = original;
    }
  });

  it('cas: ошибки insert/update тоже ведут к fail open', async () => {
    db.mode = 'cas';
    const original = fakeClient.from;
    fakeClient.from = (table: string) => {
      const real = original(table);
      if (table !== 'rate_limits') return real;
      return { ...real, insert: async () => ({ data: null, error: { code: '42501', message: 'denied' } }) } as ReturnType<typeof original>;
    };
    try {
      expect((await rateLimit(BUCKET, LIMIT, WINDOW)).allowed).toBe(true);
    } finally {
      fakeClient.from = original;
    }
    db.rows.set(BUCKET, { bucket: BUCKET, window_start: new Date(T0).toISOString(), hits: 1 });
    fakeClient.from = (table: string) => {
      const real = original(table);
      if (table !== 'rate_limits') return real;
      return {
        ...real,
        update: () => ({
          eq() {
            return this;
          },
          select: async () => ({ data: null, error: { code: '42501', message: 'denied' } }),
        }),
      } as ReturnType<typeof original>;
    };
    try {
      expect((await rateLimit(BUCKET, LIMIT, WINDOW)).allowed).toBe(true);
      expect(JSON.stringify(db.logs)).toContain('rate_limits update');
    } finally {
      fakeClient.from = original;
    }
  });
});

describe('rateLimitScope / hitRateLimit / clientIp', () => {
  beforeEach(() => {
    db.mode = 'rpc';
  });

  it('scope booking: bucket = booking:<ip>, лимит из RATE_LIMITS', async () => {
    for (let i = 0; i < RATE_LIMITS.booking.limit; i += 1) await rateLimitScope('booking', '1.1.1.1');
    expect((await rateLimitScope('booking', '1.1.1.1')).allowed).toBe(false);
    expect(db.rows.has('booking:1.1.1.1')).toBe(true);
  });

  it('scope slots: 30 в минуту', async () => {
    const results = await Promise.all(Array.from({ length: 31 }, () => rateLimitScope('slots', '2.2.2.2')));
    expect(results.filter((r) => r.allowed)).toHaveLength(30);
  });

  it('hitRateLimit — совместимость: boolean', async () => {
    expect(await hitRateLimit('x', 1, 60)).toBe(true);
    expect(await hitRateLimit('x', 1, 60)).toBe(false);
  });

  it('clientIp: x-forwarded-for → x-real-ip → unknown, длина ограничена', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'x-real-ip': ' 198.51.100.2 ' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers({ 'x-forwarded-for': ' ', 'x-real-ip': '198.51.100.3' }))).toBe('198.51.100.3');
    expect(clientIp(new Headers())).toBe('unknown');
    expect(clientIp(new Headers({ 'x-forwarded-for': 'a'.repeat(500) }))).toHaveLength(64);
  });
});

describe('scopeLimitFromSettings — маппинг settings.rate_limits в scope', () => {
  it('booking_per_10min → scope booking (окно 600с)', () => {
    expect(scopeLimitFromSettings({ booking_per_10min: 3, cancel_per_15min: 7 }, 'booking')).toEqual({
      limit: 3,
      windowSeconds: 600,
    });
  });

  it('cancel_per_15min → scope cancel и reschedule (окно 900с)', () => {
    expect(scopeLimitFromSettings({ cancel_per_15min: 7 }, 'cancel')).toEqual({ limit: 7, windowSeconds: 900 });
    expect(scopeLimitFromSettings({ cancel_per_15min: 7 }, 'reschedule')).toEqual({ limit: 7, windowSeconds: 900 });
  });

  it('slots не имеет настройки → null (берётся дефолт RATE_LIMITS)', () => {
    expect(scopeLimitFromSettings({ booking_per_10min: 3, cancel_per_15min: 7 }, 'slots')).toBeNull();
  });

  it('пусто / нечисловое / null / undefined → null', () => {
    expect(scopeLimitFromSettings(null, 'booking')).toBeNull();
    expect(scopeLimitFromSettings(undefined, 'booking')).toBeNull();
    expect(scopeLimitFromSettings({}, 'booking')).toBeNull();
    expect(scopeLimitFromSettings({ booking_per_10min: 'x' as unknown as number }, 'booking')).toBeNull();
  });
});
