// tests/unit/supabase-mock.ts — мок Supabase для unit-тестов server actions кабинета.
// Любая цепочка .from(t).select().eq()… записывается и при await возвращает следующий результат из очереди таблицы.
// Так тест проверяет и ответ action, и то, какие условия попали в WHERE (права и защита от гонок).
import { vi } from 'vitest';

export type DbResult = { data?: unknown; error?: { code?: string; message: string } | null; count?: number | null };
export type QueryCall = { table: string; ops: { method: string; args: unknown[] }[] };

const queues = new Map<string, DbResult[]>();
export const calls: QueryCall[] = [];

export function queueResult(table: string, ...results: DbResult[]): void {
  queues.set(table, [...(queues.get(table) ?? []), ...results]);
}

function nextResult(table: string): DbResult {
  const q = queues.get(table) ?? [];
  const r = q.shift();
  return { data: null, error: null, count: null, ...(r ?? {}) };
}

// Thenable-цепочка: каждый метод возвращает её же, await отдаёт результат из очереди.
function builder(table: string): Record<string, unknown> {
  const call: QueryCall = { table, ops: [] };
  calls.push(call);
  const target: Record<string, unknown> = {};
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const result = nextResult(table);
        return (resolve: (v: DbResult) => unknown) => resolve(result);
      }
      return (...args: unknown[]) => {
        call.ops.push({ method: prop, args });
        return proxy;
      };
    },
  });
  return proxy;
}

export const storageApi = {
  createSignedUploadUrl: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
};

export const authAdmin = { createUser: vi.fn(), deleteUser: vi.fn() };

export const db = {
  from: (table: string) => builder(table),
  storage: { from: () => storageApi },
  auth: { admin: authAdmin },
};

export function resetDb(): void {
  queues.clear();
  calls.length = 0;
  Object.values(storageApi).forEach((f) => f.mockReset());
  Object.values(authAdmin).forEach((f) => f.mockReset());
  storageApi.remove.mockResolvedValue({ data: [], error: null });
  storageApi.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/photo.jpg' } });
  authAdmin.deleteUser.mockResolvedValue({ data: {}, error: null });
}

// Есть ли в запросах к таблице вызов method с аргументами args (например, eq('business_id', B)).
export function hasOp(table: string, method: string, ...args: unknown[]): boolean {
  return calls.some((c) => c.table === table && c.ops.some((o) => o.method === method && JSON.stringify(o.args) === JSON.stringify(args)));
}

export function opsOf(table: string): string[] {
  return calls.filter((c) => c.table === table).flatMap((c) => c.ops.map((o) => o.method));
}

// Аргумент первого вызова method к таблице — для сравнения через toEqual (без зависимости от порядка ключей).
export function argOf(table: string, method: string): unknown {
  for (const c of calls) {
    if (c.table !== table) continue;
    const op = c.ops.find((o) => o.method === method);
    if (op) return op.args[0];
  }
  return undefined;
}
