// lib/telegram.fake-db.ts — in-memory подмена Supabase для Vitest-тестов Telegram-интеграции.
// Поддерживает ровно то, что используют lib/telegram*.ts и lib/rate-limit.ts:
// insert/upsert/update/delete/select + eq/is/gte/gt/lt/not/order/limit + single/maybeSingle,
// уникальные ключи (23505) и «таблица отсутствует» (42P01).
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
interface DbError { code: string; message: string }
interface Result { data: unknown; error: DbError | null; count: number | null }

const UNIQUE_KEYS: Record<string, string> = {
  webhook_events: 'event_id',
  rate_limits: 'bucket',
  business_telegram_codes: 'code',
  businesses: 'id',
};

export interface FakeDb {
  tables: Record<string, Row[]>;
  missing: Set<string>;
  client: () => { from: (table: string) => QueryBuilder; rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: DbError | null }> };
  reset: () => void;
}

function compare(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''));
}

class QueryBuilder implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row | null = null;
  private returning = false;
  private head = false;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private orderBy: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;

  constructor(private readonly db: FakeDb, private readonly table: string) {}

  select(_columns?: string, opts?: { count?: string; head?: boolean }): this {
    if (this.op === 'select') this.head = Boolean(opts?.head);
    else this.returning = true;
    return this;
  }
  insert(row: Row): this { this.op = 'insert'; this.payload = row; return this; }
  upsert(row: Row): this { this.op = 'upsert'; this.payload = row; return this; }
  update(values: Row): this { this.op = 'update'; this.payload = values; return this; }
  delete(): this { this.op = 'delete'; return this; }
  eq(column: string, value: unknown): this { this.filters.push((r) => r[column] === value); return this; }
  is(column: string, value: null): this { this.filters.push((r) => (r[column] ?? null) === value); return this; }
  gte(column: string, value: string): this { this.filters.push((r) => compare(r[column], value) >= 0); return this; }
  gt(column: string, value: string): this { this.filters.push((r) => compare(r[column], value) > 0); return this; }
  lt(column: string, value: string): this { this.filters.push((r) => compare(r[column], value) < 0); return this; }
  not(column: string, _op: string, value: null): this { this.filters.push((r) => (r[column] ?? null) !== value); return this; }
  order(column: string, opts?: { ascending?: boolean }): this { this.orderBy = { column, ascending: opts?.ascending ?? true }; return this; }
  limit(n: number): this { this.max = n; return this; }
  single(): this { this.mode = 'single'; return this; }
  maybeSingle(): this { this.mode = 'maybe'; return this; }

  then<T1 = Result, T2 = never>(onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null, onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    const all = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    return all;
  }

  private matched(): Row[] {
    let rows = this.rows().filter((r) => this.filters.every((f) => f(r)));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
    }
    return this.max === null ? rows : rows.slice(0, this.max);
  }

  private shape(rows: Row[]): Result {
    if (this.mode === 'many') return { data: rows, error: null, count: rows.length };
    if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' }, count: null };
    if (!rows.length && this.mode === 'single') return { data: null, error: { code: 'PGRST116', message: 'no rows' }, count: null };
    return { data: rows[0] ?? null, error: null, count: rows.length };
  }

  private execute(): Result {
    if (this.db.missing.has(this.table)) return { data: null, error: { code: '42P01', message: 'relation does not exist' }, count: null };
    if (this.op === 'insert' || this.op === 'upsert') return this.write();
    if (this.op === 'update') {
      const rows = this.matched();
      rows.forEach((r) => Object.assign(r, this.payload));
      return this.returning ? this.shape(rows.map((r) => ({ ...r }))) : { data: null, error: null, count: rows.length };
    }
    if (this.op === 'delete') {
      const doomed = new Set(this.matched());
      this.db.tables[this.table] = this.rows().filter((r) => !doomed.has(r));
      return { data: null, error: null, count: doomed.size };
    }
    const rows = this.matched();
    if (this.head) return { data: null, error: null, count: rows.length };
    return this.shape(rows.map((r) => ({ ...r })));
  }

  private write(): Result {
    const key = UNIQUE_KEYS[this.table];
    const row: Row = { created_at: new Date().toISOString(), ...this.payload };
    if (this.table === 'businesses' && !row.id) row.id = `b${this.rows().length + 1}`;
    const existing = key ? this.rows().find((r) => r[key] === row[key]) : undefined;
    if (existing && this.op === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key' }, count: null };
    if (existing) Object.assign(existing, row);
    else this.rows().push(row);
    return this.returning ? this.shape([{ ...(existing ?? row) }]) : { data: null, error: null, count: 1 };
  }
}

// Повторяет SQL-функцию rate_limit_hit из supabase/migrations/0012_rate_limit_hit.sql (фиксированное окно,
// счётчик ограничен limit + 1). Остальные функции не реализованы: PGRST202, как у PostgREST без функции.
function callRpc(db: FakeDb, name: string, args: Record<string, unknown>): { data: unknown; error: DbError | null } {
  if (name !== 'rate_limit_hit') return { data: null, error: { code: 'PGRST202', message: `function ${name} not found` } };
  const bucket = String(args.p_bucket);
  const limit = Number(args.p_limit);
  const windowMs = Number(args.p_window_seconds) * 1000;
  const now = Date.now();
  const rows = db.tables.rate_limits ?? (db.tables.rate_limits = []);
  let row = rows.find((r) => r.bucket === bucket);
  if (!row) {
    row = { bucket, window_start: new Date(now).toISOString(), hits: 1 };
    rows.push(row);
  } else if (Date.parse(String(row.window_start)) <= now - windowMs) {
    row.window_start = new Date(now).toISOString();
    row.hits = 1;
  } else {
    row.hits = Math.min(Number(row.hits) + 1, limit + 1);
  }
  const hits = Number(row.hits);
  const retryAfter = Math.max(0, Math.ceil((Date.parse(String(row.window_start)) + windowMs - now) / 1000));
  return { data: [{ allowed: hits <= limit, hits, retry_after: retryAfter }], error: null };
}

export function createFakeDb(): FakeDb {
  const db: FakeDb = {
    tables: {},
    missing: new Set(),
    client: () => ({
      from: (table: string) => new QueryBuilder(db, table),
      rpc: async (name: string, args: Record<string, unknown>) => callRpc(db, name, args),
    }),
    reset: () => {
      db.tables = {};
      db.missing.clear();
    },
  };
  return db;
}
