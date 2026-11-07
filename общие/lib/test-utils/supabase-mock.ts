// lib/test-utils/supabase-mock.ts — мок Supabase для юнит-тестов cron.
// Каждый запрос записывается (таблица, операция, фильтры, payload), ответ даёт функция resolve(query).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CronContext, CronLogger, CronNotifier, CronValue } from '../cron';

export type Filter = { method: string; args: readonly unknown[] };

export interface RecordedQuery {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'rpc';
  payload: unknown;
  filters: Filter[];
}

export interface MockResponse {
  data: unknown;
  error: { message: string } | null;
}

export type Resolver = (query: RecordedQuery) => MockResponse;

const FILTER_METHODS = [
  'select', 'eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'is', 'not', 'or', 'contains',
  'order', 'limit', 'range', 'maybeSingle', 'single',
] as const;

export const ok = (data: unknown = []): MockResponse => ({ data, error: null });
export const fail = (message: string): MockResponse => ({ data: null, error: { message } });

class QueryBuilder implements PromiseLike<MockResponse> {
  constructor(readonly query: RecordedQuery, private readonly resolve: Resolver) {}

  then<TResult1 = MockResponse, TResult2 = never>(
    onfulfilled?: ((value: MockResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve(this.query)).then(onfulfilled, onrejected);
  }
}

// Добавляет к QueryBuilder цепочечные методы фильтров.
for (const method of FILTER_METHODS) {
  Object.defineProperty(QueryBuilder.prototype, method, {
    value: function chain(this: QueryBuilder, ...args: unknown[]) {
      this.query.filters.push({ method, args });
      return this;
    },
  });
}

export interface DbMock {
  client: SupabaseClient;
  queries: RecordedQuery[];
  storageCalls: { bucket: string; method: string; args: unknown[] }[];
}

export function createDbMock(resolve: Resolver = () => ok()): DbMock {
  const queries: RecordedQuery[] = [];
  const storageCalls: DbMock['storageCalls'] = [];
  const start = (table: string, op: RecordedQuery['op'], payload: unknown) => {
    const query: RecordedQuery = { table, op, payload, filters: [] };
    queries.push(query);
    return new QueryBuilder(query, resolve);
  };
  const client = {
    from: (table: string) => ({
      select: (columns?: string) => start(table, 'select', columns ?? '*'),
      insert: (payload: unknown) => start(table, 'insert', payload),
      update: (payload: unknown) => start(table, 'update', payload),
      upsert: (payload: unknown) => start(table, 'upsert', payload),
      delete: () => start(table, 'delete', null),
    }),
    rpc: (fn: string, args: unknown) => start(fn, 'rpc', args),
    storage: {
      from: (bucket: string) => ({
        upload: async (...args: unknown[]) => {
          storageCalls.push({ bucket, method: 'upload', args });
          return { data: { path: String(args[0]) }, error: null };
        },
        list: async (...args: unknown[]) => {
          storageCalls.push({ bucket, method: 'list', args });
          return { data: [], error: null };
        },
        remove: async (...args: unknown[]) => {
          storageCalls.push({ bucket, method: 'remove', args });
          return { data: [], error: null };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, queries, storageCalls };
}

export function filterValue(query: RecordedQuery, method: string, column?: string): unknown {
  const found = query.filters.find((f) => f.method === method && (column === undefined || f.args[0] === column));
  if (found === undefined) return undefined;
  return column === undefined ? found.args[0] : found.args[1];
}

export interface NotifierMock extends CronNotifier {
  mails: { to: string; subject: string; text: string }[];
  telegrams: { chatId: string; text: string }[];
  adminMessages: string[];
}

export function createNotifierMock(options: { mailOk?: boolean; mailThrows?: boolean } = {}): NotifierMock {
  const mails: NotifierMock['mails'] = [];
  const telegrams: NotifierMock['telegrams'] = [];
  const adminMessages: string[] = [];
  return {
    mails,
    telegrams,
    adminMessages,
    async sendMail(opts) {
      if (options.mailThrows === true) throw new Error('smtp down');
      mails.push({ to: opts.to, subject: opts.subject, text: opts.text });
      return options.mailOk ?? true;
    },
    async sendTelegram(chatId, text) {
      telegrams.push({ chatId, text });
      return true;
    },
    async notifyAdmin(text) {
      adminMessages.push(text);
      return true;
    },
  };
}

export interface LoggerMock extends CronLogger {
  errors: { message: string; payload: Record<string, CronValue> }[];
  results: { job: string; payload: Record<string, CronValue> }[];
}

export function createLoggerMock(): LoggerMock {
  const errors: LoggerMock['errors'] = [];
  const results: LoggerMock['results'] = [];
  return {
    errors,
    results,
    async error(message, payload) {
      errors.push({ message, payload });
    },
    async result(job, payload) {
      results.push({ job, payload });
    },
  };
}

export const TEST_NOW = new Date('2026-10-15T09:00:00.000Z');
const TEST_BUDGET_MS = 50_000;

export interface TestContext extends CronContext {
  dbMock: DbMock;
  notifyMock: NotifierMock;
  logMock: LoggerMock;
}

export function createTestContext(
  resolve: Resolver = () => ok(),
  options: { mailOk?: boolean; mailThrows?: boolean; fetchImpl?: typeof fetch; now?: Date } = {},
): TestContext {
  const dbMock = createDbMock(resolve);
  const notifyMock = createNotifierMock(options);
  const logMock = createLoggerMock();
  const now = options.now ?? TEST_NOW;
  const defaultFetch: typeof fetch = async () => new Response('{}', { status: 200 });
  return {
    db: dbMock.client,
    now,
    deadline: Date.now() + TEST_BUDGET_MS,
    notify: notifyMock,
    log: logMock,
    env: {
      siteUrl: 'https://example.test',
      vercelApiToken: 'token',
      vercelProjectId: 'prj_1',
      vercelTeamId: '',
    },
    fetch: options.fetchImpl ?? defaultFetch,
    dbMock,
    notifyMock,
    logMock,
  };
}
