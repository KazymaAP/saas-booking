// Тесты разбора ответов Supabase: сбой базы не должен превращаться в «пусто» / «0».
import { describe, expect, it } from 'vitest';
import { countOf, rowsOf } from './db';

describe('rowsOf', () => {
  it('строки возвращаются как есть', () => {
    expect(rowsOf({ data: [1, 2], error: null })).toEqual([1, 2]);
  });
  it('null без ошибки — пустой массив', () => {
    expect(rowsOf({ data: null, error: null })).toEqual([]);
  });
  it('ошибка — исключение с текстом базы', () => {
    expect(() => rowsOf({ data: null, error: { message: 'timeout' } })).toThrow('timeout');
  });
});

describe('countOf', () => {
  it('число возвращается как есть', () => {
    expect(countOf({ count: 7, error: null })).toBe(7);
  });
  it('null без ошибки — 0', () => {
    expect(countOf({ count: null, error: null })).toBe(0);
  });
  it('ошибка — исключение, а не 0', () => {
    expect(() => countOf({ count: null, error: { message: 'boom' } })).toThrow('boom');
  });
});
