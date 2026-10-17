// Тесты сборки ссылок пагинации/фильтров и разбора searchParams.
import { describe, expect, it } from 'vitest';
import { one, pageNumber, pagerState, searchTerm, uuidParam, withParams } from './url';

describe('withParams', () => {
  it('сохраняет фильтры, меняет страницу, удаляет пустые', () => {
    expect(withParams({ status: 'new', city: 'Казань', q: '' }, { page: 2 })).toBe('?status=new&city=%D0%9A%D0%B0%D0%B7%D0%B0%D0%BD%D1%8C&page=2');
    expect(withParams({ status: 'new', page: '3' }, { page: undefined })).toBe('?status=new');
    expect(withParams({}, { a: null, b: '' })).toBe('?');
  });
  it('из повторного ключа берёт первое значение', () => {
    expect(withParams({ status: ['new', 'archived'] }, {})).toBe('?status=new');
  });
});

describe('разбор параметров', () => {
  it('one', () => {
    expect(one(['a', 'b'])).toBe('a');
    expect(one(undefined)).toBeUndefined();
  });
  it('pageNumber: только целые ≥ 1, с верхней границей', () => {
    expect(pageNumber('5')).toBe(5);
    expect(pageNumber('0')).toBe(1);
    expect(pageNumber('-2')).toBe(1);
    expect(pageNumber('1.5')).toBe(1);
    expect(pageNumber('abc')).toBe(1);
    expect(pageNumber('999999', 100)).toBe(100);
  });
  it('searchTerm: спецсимволы ilike и .or() вырезаются, длина ограничена', () => {
    expect(searchTerm('50%_off,(x)*')).toBe('50  off  x');
    expect(searchTerm('a'.repeat(300))).toHaveLength(100);
    expect(searchTerm(undefined)).toBe('');
  });
  it('uuidParam: невалидное значение — пустая строка', () => {
    expect(uuidParam('3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBe('3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f');
    expect(uuidParam("1' or 1=1")).toBe('');
  });
});

describe('pagerState', () => {
  const base = { pageSize: 50, shown: 50 };
  it('одна страница — ни назад, ни дальше', () => {
    expect(pagerState({ ...base, page: 1, total: 30, shown: 30 })).toEqual({ pages: 1, prev: null, next: null, outOfRange: false });
  });
  it('середина — обе ссылки', () => {
    expect(pagerState({ ...base, page: 2, total: 160 })).toMatchObject({ pages: 4, prev: 1, next: 3 });
  });
  it('номер за пределами — «назад» сразу на последнюю, «дальше» нет', () => {
    expect(pagerState({ ...base, page: 99, total: 120, shown: 0 })).toEqual({ pages: 3, prev: 3, next: null, outOfRange: true });
  });
  it('пустая выборка на ?page=5 — назад на первую', () => {
    expect(pagerState({ ...base, page: 5, total: 0, shown: 0 })).toMatchObject({ pages: 1, prev: 1, outOfRange: true });
  });
  it('без total (журнал) — по явному hasNext', () => {
    expect(pagerState({ ...base, page: 3, total: null, hasNext: false })).toEqual({ pages: null, prev: 2, next: null, outOfRange: false });
    expect(pagerState({ ...base, page: 1, total: null, hasNext: true }).next).toBe(2);
  });
});
