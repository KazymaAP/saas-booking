// Тесты разбора фильтров журнала: вкладки, проверка значений, период по Москве.
import { describe, expect, it } from 'vitest';
import { dateParam, hasFilters, periodBounds, readLogFilters } from './filters';

const ID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('readLogFilters', () => {
  it('по умолчанию — вкладка ошибок, страница 1, без фильтров', () => {
    const f = readLogFilters({});
    expect(f).toMatchObject({ tab: 'errors', page: 1, source: '', q: '' });
    expect(hasFilters(f)).toBe(false);
  });
  it('источник — только из списка LOG_SOURCES', () => {
    expect(readLogFilters({ source: 'email' }).source).toBe('email');
    expect(readLogFilters({ source: 'drop table' }).source).toBe('');
  });
  it('фильтры чужой вкладки не применяются', () => {
    const errors = readLogFilters({ tab: 'errors', action: 'mark_paid', entity_id: ID });
    expect(errors.action).toBe('');
    expect(errors.entity_id).toBe('');
    const audit = readLogFilters({ tab: 'audit', source: 'email', q: 'x', action: 'mark_paid', entity: 'business', entity_id: ID });
    expect(audit).toMatchObject({ source: '', q: '', action: 'mark_paid', entity: 'business', entity_id: ID });
  });
  it('неизвестное действие и не-UUID объект игнорируются', () => {
    const f = readLogFilters({ tab: 'audit', action: 'error:email', entity_id: '1 or 1=1' });
    expect(f.action).toBe('');
    expect(f.entity_id).toBe('');
  });
  it('поиск очищается от спецсимволов PostgREST', () => {
    expect(readLogFilters({ q: 'smtp,(timeout)%' }).q).toBe('smtp  timeout');
  });
  it('перепутанные даты меняются местами', () => {
    const f = readLogFilters({ from: '2026-10-10', to: '2026-10-01' });
    expect([f.from, f.to]).toEqual(['2026-10-01', '2026-10-10']);
  });
});

describe('dateParam / periodBounds', () => {
  it('несуществующая дата отбрасывается', () => {
    expect(dateParam('2026-02-30')).toBe('');
    expect(dateParam('2026-02-28')).toBe('2026-02-28');
    expect(dateParam('28.02.2026')).toBe('');
  });
  it('границы — сутки по Москве, «по» включительно', () => {
    expect(periodBounds({ from: '2026-10-01', to: '2026-10-01' })).toEqual({ gte: '2026-09-30T21:00:00.000Z', lt: '2026-10-01T21:00:00.000Z' });
    expect(periodBounds({ from: '', to: '' })).toEqual({ gte: undefined, lt: undefined });
  });
});
