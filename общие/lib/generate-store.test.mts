// lib/generate-store.test.mts — адаптер Supabase для генератора (Vitest). Клиент — минимальный фейк цепочки запросов.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { supabaseGenerateStore } from './generate-store';

type Call = { table: string; op: string; args: unknown[] };
type Result = { data?: unknown; count?: number | null; error: { message: string; code?: string } | null };

// Каждый await цепочки забирает следующий заготовленный ответ; все вызовы методов пишутся в calls.
function fakeClient(results: Result[]): { db: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const builder = (table: string): object => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'or', 'neq', 'limit', 'eq', 'insert', 'update']) {
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
    }
    chain.then = (resolve: (r: Result) => void) => resolve(results.shift() ?? { error: null });
    return chain;
  };
  // Фейк реализует только те методы, которые вызывает адаптер; приведение — граница теста.
  return { db: { from: (t: string) => builder(t) } as unknown as SupabaseClient, calls };
}

describe('supabaseGenerateStore', () => {
  it('slugTaken: невалидный slug не уходит в .or() и считается занятым', async () => {
    const { db, calls } = fakeClient([]);
    expect(await supabaseGenerateStore(db).slugTaken('a,slug.eq.x', 'b1')).toBe(true);
    expect(calls).toEqual([]);
  });

  it('slugTaken: ищет в slug и slug_history, исключая сам бизнес', async () => {
    const { db, calls } = fakeClient([{ data: [{ id: 'b2' }], error: null }, { data: [], error: null }]);
    const store = supabaseGenerateStore(db);
    expect(await store.slugTaken('shina', 'b1')).toBe(true);
    expect(await store.slugTaken('shina', 'b1')).toBe(false);
    expect(calls.find((c) => c.op === 'or')?.args[0]).toBe('slug.eq.shina,slug_history.cs.{shina}');
    expect(calls.find((c) => c.op === 'neq')?.args).toEqual(['id', 'b1']);
  });

  it('ошибка БД пробрасывается с понятным контекстом', async () => {
    const { db } = fakeClient([{ count: null, error: { message: 'timeout' } }]);
    await expect(supabaseGenerateStore(db).countServices('b1')).rejects.toThrow('услуги: timeout');
  });

  it('updateBusiness: нет колонок generation_* — сохраняет остальное без них', async () => {
    const { db, calls } = fakeClient([{ error: { message: 'column not found', code: 'PGRST204' } }, { error: null }]);
    await supabaseGenerateStore(db).updateBusiness('b1', { slug: 's', generation_status: 'done', generation_attempts: 1, generation_error: null });
    const updates = calls.filter((c) => c.op === 'update').map((c) => c.args[0]);
    expect(updates).toEqual([{ slug: 's', generation_status: 'done', generation_attempts: 1, generation_error: null }, { slug: 's' }]);
  });

  it('updateBusiness: прочие ошибки не маскируются', async () => {
    const { db, calls } = fakeClient([{ error: { message: 'duplicate key', code: '23505' } }]);
    await expect(supabaseGenerateStore(db).updateBusiness('b1', { slug: 's' })).rejects.toThrow('обновление бизнеса: duplicate key');
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });
});
