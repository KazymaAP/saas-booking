// app/panel/(protected)/_lib/fake-db.ts — поддельный Supabase-клиент для unit-тестов server actions (только тесты).
// Любая цепочка .from(t).update(...).eq(...).select(...) записывается в журнал вызовов и при await
// возвращает ответ из очереди responder'а. Так тест проверяет и итог действия, и сами SQL-условия.

export type Call = { method: string; args: unknown[] };
export type Query = { table: string; calls: Call[] };
export type Reply = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };

const CHAIN = [
  'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'lt', 'gt',
  'like', 'ilike', 'or', 'order', 'range', 'limit', 'returns', 'maybeSingle', 'single', 'contains',
] as const;

type Builder = Record<(typeof CHAIN)[number], (...args: unknown[]) => Builder> & PromiseLike<Reply>;

export type FakeDb = {
  client: { from: (table: string) => Builder; auth: { admin: Record<string, (...args: unknown[]) => Promise<unknown>> } };
  queries: Query[];
  // Ответы по порядку для таблицы; когда очередь пуста — { data: null, error: null }.
  reply: (table: string, ...replies: Reply[]) => void;
  reset: () => void;
  // Все вызовы метода в запросах к таблице (например, условия eq у UPDATE).
  find: (table: string, method: string) => Query[];
};

export function createFakeDb(auth: Record<string, (...args: unknown[]) => Promise<unknown>> = {}): FakeDb {
  const queue = new Map<string, Reply[]>();
  const queries: Query[] = [];

  function builder(q: Query): Builder {
    const b = {} as Builder;
    for (const m of CHAIN) {
      b[m] = (...args: unknown[]) => {
        q.calls.push({ method: m, args });
        return b;
      };
    }
    b.then = <R1, R2>(ok?: ((v: Reply) => R1 | PromiseLike<R1>) | null, bad?: ((e: unknown) => R2 | PromiseLike<R2>) | null) => {
      const next = queue.get(q.table)?.shift() ?? { data: null, error: null };
      return Promise.resolve({ error: null, ...next }).then(ok, bad);
    };
    return b;
  }

  return {
    client: {
      from: (table: string) => {
        const q: Query = { table, calls: [] };
        queries.push(q);
        return builder(q);
      },
      auth: { admin: auth },
    },
    queries,
    reply: (table, ...replies) => queue.set(table, [...(queue.get(table) ?? []), ...replies]),
    reset: () => {
      queue.clear();
      queries.length = 0;
    },
    find: (table, method) => queries.filter((q) => q.table === table && q.calls.some((c) => c.method === method)),
  };
}

// Значение аргумента вызова method(args[0] === key) — например, eq('status', …) → …
export function argOf(q: Query, method: string, key: string): unknown {
  return q.calls.find((c) => c.method === method && c.args[0] === key)?.args[1];
}
