// lib/__test__/harness.ts — общее окружение unit-тестов auth: подмена cookies/headers Next.js,
// провайдера аутентификации, rate limit и журнала. Сеть и БД в тестах не используются.
export type CookieRecord = { value: string; maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string; domain?: string };

export const jar = new Map<string, CookieRecord>();
export const requestHeaders = new Map<string, string>();
export const auditCalls: Array<{ action: string; payload: Record<string, unknown> }> = [];
export const rateHits = new Map<string, number>();

export function resetHarness(): void {
  jar.clear();
  requestHeaders.clear();
  auditCalls.length = 0;
  rateHits.clear();
  requestHeaders.set('host', 'zapishisya.ru');
  requestHeaders.set('origin', 'https://zapishisya.ru');
  requestHeaders.set('x-forwarded-for', '203.0.113.7');
}

export const cookiesMock = {
  get: (name: string) => {
    const c = jar.get(name);
    return c && c.value !== '' ? { name, value: c.value } : undefined;
  },
  set: (name: string, value: string, options: Omit<CookieRecord, 'value'> = {}) => {
    jar.set(name, { value, ...options });
  },
  delete: (name: string) => {
    jar.delete(name);
  },
};

export const headersMock = {
  get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null,
};

// Rate limit в памяти с теми же правилами, что lib/rate-limit.ts (фиксированное окно).
export async function fakeHitRateLimit(bucket: string, limit: number): Promise<boolean> {
  await Promise.resolve();
  const hits = (rateHits.get(bucket) ?? 0) + 1;
  rateHits.set(bucket, hits);
  return hits <= limit;
}

export async function fakeAudit(action: string, _entity: string, _id: string | null, payload: Record<string, unknown> = {}): Promise<void> {
  await Promise.resolve();
  auditCalls.push({ action, payload });
}

export function auditActions(): string[] {
  return auditCalls.map((c) => c.action);
}

// Мини-БД в памяти с подмножеством API supabase-js, которое используют lib/auth-* и owner-session.
export type Row = Record<string, unknown>;
export const tables = new Map<string, Row[]>();

export function seed(table: string, rows: Row[]): void {
  tables.set(table, rows.map((r) => ({ ...r })));
}

type Filter = (row: Row) => boolean;

class FakeQuery {
  private filters: Filter[] = [];
  private patch: Row | null = null;
  private inserted: Row[] | null = null;
  private deleting = false;
  private returning = false;

  constructor(private readonly table: string) {}

  private rows(): Row[] {
    const existing = tables.get(this.table);
    if (existing) return existing;
    const created: Row[] = [];
    tables.set(this.table, created);
    return created;
  }

  select(): this { this.returning = true; return this; }
  eq(col: string, value: unknown): this { this.filters.push((r) => r[col] === value); return this; }
  is(col: string, value: unknown): this { this.filters.push((r) => (r[col] ?? null) === value); return this; }
  gt(col: string, value: string): this { this.filters.push((r) => String(r[col]) > value); return this; }
  order(): this { return this; }
  limit(): this { return this; }
  returns(): this { return this; }
  update(patch: Row): this { this.patch = patch; return this; }
  delete(): this { this.deleting = true; return this; }
  insert(row: Row | Row[]): this {
    this.inserted = (Array.isArray(row) ? row : [row]).map((r) => ({ id: `id-${Math.random().toString(16).slice(2)}`, ...r }));
    return this;
  }

  private execute(): Row[] {
    const all = this.rows();
    if (this.inserted) {
      all.push(...this.inserted);
      return this.inserted;
    }
    const matched = all.filter((r) => this.filters.every((f) => f(r)));
    if (this.patch) for (const r of matched) Object.assign(r, this.patch);
    if (this.deleting) tables.set(this.table, all.filter((r) => !matched.includes(r)));
    return matched;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    await Promise.resolve();
    return { data: this.execute()[0] ?? null, error: null };
  }

  async single(): Promise<{ data: Row | null; error: null }> {
    return this.maybeSingle();
  }

  // Делает объект «thenable», как PostgrestBuilder: await db.from(...).update(...).eq(...)
  then<T>(resolve: (v: { data: Row[] | null; error: null }) => T): Promise<T> {
    const data = this.execute();
    return Promise.resolve(resolve({ data: this.returning || this.inserted ? data : null, error: null }));
  }
}

export const fakeDb = { from: (table: string) => new FakeQuery(table) };

export const sentMails: Array<{ to: string; subject: string; text: string }> = [];

export async function fakeSendMail(mail: { to: string; subject: string; text: string }): Promise<boolean> {
  await Promise.resolve();
  sentMails.push(mail);
  return true;
}
