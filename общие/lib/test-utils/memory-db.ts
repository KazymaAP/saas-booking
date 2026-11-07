// lib/test-utils/memory-db.ts — Supabase в памяти для тестов cron-хендлеров.
// Понимает подмножество PostgREST, которое используют задачи: select/insert/update/delete/upsert,
// фильтры eq/neq/in/is/not.is/lt/lte/gt/gte, order, limit, range, rpc и Storage (list/upload/remove).
// Проекция колонок и вложенные выборки не поддерживаются: select возвращает строки целиком (копии).
// Сравнение — строковое/числовое, поэтому даты в тестах задаются в том же формате, что и в запросах (ISO / YYYY-MM-DD).
import type { SupabaseClient } from '@supabase/supabase-js';

export type Row = Record<string, unknown>;
export type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export interface MemoryQuery {
  table: string;
  op: Op;
  payload: Row | Row[] | null;
  filters: { method: string; args: readonly unknown[] }[];
}

export interface DbError {
  message: string;
}

export interface MemoryDbOptions {
  // Вернуть текст ошибки, чтобы запрос завершился { data: null, error }.
  failOn?: (query: MemoryQuery) => string | null;
  rpc?: Record<string, (args: Row, db: MemoryDb) => unknown>;
  // Вернуть текст ошибки, чтобы вызов Storage (bucket, метод) завершился { data: null, error }.
  failStorage?: (bucket: string, method: 'list' | 'upload' | 'remove') => string | null;
}

export interface MemoryDb {
  client: SupabaseClient;
  tables: Record<string, Row[]>;
  queries: MemoryQuery[];
  storage: Record<string, string[]>;
  rpcCalls: { fn: string; args: Row }[];
}

type Result = { data: unknown; error: DbError | null };

function compare(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function matches(row: Row, filter: { method: string; args: readonly unknown[] }): boolean {
  const [column, value, extra] = filter.args;
  const cell = row[String(column)];
  switch (filter.method) {
    case 'eq': return cell === value;
    case 'neq': return cell !== value;
    case 'in': return Array.isArray(value) && value.includes(cell);
    case 'is': return value === null ? cell === null || cell === undefined : cell === value;
    case 'not': return value === 'is' && extra === null ? cell !== null && cell !== undefined : true;
    case 'lt': return cell !== null && cell !== undefined && compare(cell, value) < 0;
    case 'lte': return cell !== null && cell !== undefined && compare(cell, value) <= 0;
    case 'gt': return cell !== null && cell !== undefined && compare(cell, value) > 0;
    case 'gte': return cell !== null && cell !== undefined && compare(cell, value) >= 0;
    default: return true;
  }
}

function applyWindow(rows: Row[], query: MemoryQuery): Row[] {
  let result = [...rows];
  for (const filter of query.filters) {
    if (filter.method === 'order') {
      const [column, opts] = filter.args;
      const ascending = (opts as { ascending?: boolean } | undefined)?.ascending !== false;
      result.sort((a, b) => compare(a[String(column)], b[String(column)]) * (ascending ? 1 : -1));
    }
  }
  const range = query.filters.find((f) => f.method === 'range');
  if (range !== undefined) result = result.slice(Number(range.args[0]), Number(range.args[1]) + 1);
  const limit = query.filters.find((f) => f.method === 'limit');
  if (limit !== undefined) result = result.slice(0, Number(limit.args[0]));
  return result;
}

function execute(db: MemoryDb, query: MemoryQuery): Result {
  const rows = db.tables[query.table] ?? [];
  db.tables[query.table] = rows;
  const selected = rows.filter((row) => query.filters.every((f) => matches(row, f)));
  switch (query.op) {
    case 'select':
      return { data: applyWindow(selected, query).map((row) => ({ ...row })), error: null };
    case 'insert':
    case 'upsert': {
      const items = (Array.isArray(query.payload) ? query.payload : [query.payload ?? {}]).map((r) => ({ ...r }));
      rows.push(...items);
      return { data: items, error: null };
    }
    case 'update': {
      for (const row of selected) Object.assign(row, query.payload);
      return { data: selected.map((row) => ({ ...row })), error: null };
    }
    case 'delete': {
      db.tables[query.table] = rows.filter((row) => selected.includes(row) === false);
      return { data: selected.map((row) => ({ ...row })), error: null };
    }
    default:
      return { data: null, error: { message: 'unsupported' } };
  }
}

const CHAIN_METHODS = ['select', 'eq', 'neq', 'in', 'is', 'not', 'lt', 'lte', 'gt', 'gte', 'order', 'limit', 'range'] as const;

class MemoryBuilder implements PromiseLike<Result> {
  constructor(readonly query: MemoryQuery, private readonly db: MemoryDb, private readonly options: MemoryDbOptions) {}

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    const failure = this.options.failOn?.(this.query) ?? null;
    const result: Result = failure === null ? execute(this.db, this.query) : { data: null, error: { message: failure } };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }

  maybeSingle(): PromiseLike<Result> {
    return this.then((res) => ({ data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data, error: res.error }));
  }
}

for (const method of CHAIN_METHODS) {
  Object.defineProperty(MemoryBuilder.prototype, method, {
    value: function chain(this: MemoryBuilder, ...args: unknown[]) {
      // select() после update/delete/insert — это «вернуть строки», а не новый запрос.
      if (method !== 'select') this.query.filters.push({ method, args });
      return this;
    },
  });
}

type StorageResult<T> = Promise<{ data: T | null; error: DbError | null }>;

function storageApi(db: MemoryDb, bucket: string, options: MemoryDbOptions) {
  const files = () => (db.storage[bucket] ??= []);
  const failure = (method: 'list' | 'upload' | 'remove') => options.failStorage?.(bucket, method) ?? null;
  const respond = <T>(method: 'list' | 'upload' | 'remove', make: () => T): StorageResult<T> => {
    const message = failure(method);
    if (message !== null) return Promise.resolve({ data: null, error: { message } });
    return Promise.resolve({ data: make(), error: null });
  };
  return {
    list(folder: string, opts?: { limit?: number }) {
      return respond('list', () => {
        const prefix = folder === '' ? '' : `${folder}/`;
        const names = files().filter((f) => f.startsWith(prefix)).map((f) => ({ name: f.slice(prefix.length) }));
        return names.slice(0, opts?.limit ?? names.length);
      });
    },
    upload(path: string) {
      return respond('upload', () => {
        if (files().includes(path) === false) files().push(path);
        return { path };
      });
    },
    remove(paths: string[]) {
      return respond('remove', () => {
        db.storage[bucket] = files().filter((f) => paths.includes(f) === false);
        return paths.map((name) => ({ name }));
      });
    },
  };
}

export function createMemoryDb(tables: Record<string, Row[]> = {}, options: MemoryDbOptions = {}): MemoryDb {
  const db: MemoryDb = { client: null as unknown as SupabaseClient, tables, queries: [], storage: {}, rpcCalls: [] };
  const start = (table: string, op: Op, payload: Row | Row[] | null) => {
    const query: MemoryQuery = { table, op, payload, filters: [] };
    db.queries.push(query);
    return new MemoryBuilder(query, db, options);
  };
  const client = {
    from: (table: string) => ({
      select: () => start(table, 'select', null),
      insert: (payload: Row | Row[]) => start(table, 'insert', payload),
      upsert: (payload: Row | Row[]) => start(table, 'upsert', payload),
      update: (payload: Row) => start(table, 'update', payload),
      delete: () => start(table, 'delete', null),
    }),
    rpc: (fn: string, args: Row): Promise<Result> => {
      db.rpcCalls.push({ fn, args });
      const failure = options.failOn?.({ table: `rpc:${fn}`, op: 'select', payload: args, filters: [] }) ?? null;
      if (failure !== null) return Promise.resolve({ data: null, error: { message: failure } });
      const impl = options.rpc?.[fn] ?? defaultRpc[fn];
      if (impl === undefined) return Promise.resolve({ data: null, error: { message: `function ${fn} not found` } });
      return Promise.resolve({ data: impl(args, db), error: null });
    },
    storage: { from: (bucket: string) => storageApi(db, bucket, options) },
  };
  // Мок реализует только используемую часть интерфейса SupabaseClient.
  db.client = client as unknown as SupabaseClient;
  return db;
}

// Боевые RPC из 0006_pg_cron.sql: блокировки и журнал идемпотентности cron_marks.
const defaultRpc: Record<string, (args: Row, db: MemoryDb) => unknown> = {
  cron_try_lock: () => true,
  cron_unlock: () => null,
  cron_claim: (args, db) => {
    const marks = (db.tables.cron_marks ??= []);
    const job = String(args.p_job);
    const claimed: string[] = [];
    for (const key of (args.p_keys as string[]) ?? []) {
      if (marks.some((m) => m.job === job && m.key === key)) continue;
      marks.push({ job, key, created_at: new Date().toISOString() });
      claimed.push(key);
    }
    return claimed;
  },
  cron_release: (args, db) => {
    const keys = (args.p_keys as string[]) ?? [];
    db.tables.cron_marks = (db.tables.cron_marks ?? []).filter(
      (m) => (m.job === args.p_job && keys.includes(String(m.key))) === false,
    );
    return null;
  },
  cron_retention: () => 0,
};
