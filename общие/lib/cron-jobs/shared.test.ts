// lib/cron-jobs/shared.test.ts — общие помощники: границы суток по Москве, порции, разбор ответов, захват ключей.
import { describe, expect, it } from 'vitest';
import { chunk, firstEmail, moscowDate, unwrap, unwrapRows, withClaimedKeys } from './shared';
import { listHash } from './check-domains';
import { memoryContext } from '../test-utils/context';

describe('moscowDate — граница суток 21:00 UTC = 00:00 МСК', () => {
  it('20:59:59 UTC — ещё вчера по Москве, 21:00 UTC — уже сегодня', () => {
    expect(moscowDate(new Date('2026-10-14T20:59:59.999Z'))).toBe('2026-10-14');
    expect(moscowDate(new Date('2026-10-14T21:00:00.000Z'))).toBe('2026-10-15');
  });

  it('сдвиг в днях переходит через месяц и год', () => {
    expect(moscowDate(new Date('2026-12-31T12:00:00Z'), 1)).toBe('2027-01-01');
    expect(moscowDate(new Date('2026-03-01T12:00:00Z'), -1)).toBe('2026-02-28');
  });
});

describe('chunk', () => {
  it('режет на порции, последняя — остаток; пустой список — пусто', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 5)).toEqual([]);
  });

  it('размер < 1 или дробный → ошибка, а не бесконечный цикл', () => {
    expect(() => chunk([1], 0)).toThrow('недопустимый размер');
    expect(() => chunk([1], 1.5)).toThrow('недопустимый размер');
  });
});

describe('firstEmail', () => {
  it('первый непустой адрес без пробелов; нет адресов → null', () => {
    expect(firstEmail(['  ', ' a@b.ru '])).toBe('a@b.ru');
    expect(firstEmail([])).toBeNull();
    expect(firstEmail(null)).toBeNull();
  });
});

describe('unwrap / unwrapRows', () => {
  it('ошибка ответа → исключение с контекстом; data null → пустой список', () => {
    expect(() => unwrap({ data: null, error: { message: 'boom' } }, 'job: шаг')).toThrow('job: шаг: boom');
    expect(unwrapRows({ data: null, error: null }, 'x')).toEqual([]);
  });
});

describe('listHash', () => {
  it('не зависит от порядка доменов и различает разные списки', () => {
    expect(listHash(['a.ru', 'b.ru'])).toBe(listHash(['b.ru', 'a.ru']));
    expect(listHash(['a.ru'])).not.toBe(listHash(['a.ru', 'b.ru']));
  });
});

describe('withClaimedKeys', () => {
  it('успех — ключи остаются; исключение — ключи освобождены и ошибка проброшена', async () => {
    const ctx = memoryContext({ cron_marks: [{ job: 'j', key: 'k1' }, { job: 'j', key: 'k2' }] });
    await withClaimedKeys(ctx, 'j', ['k1'], async () => 1);
    expect(ctx.mem.tables.cron_marks?.length).toBe(2);
    await expect(withClaimedKeys(ctx, 'j', ['k1'], async () => {
      throw new Error('db');
    })).rejects.toThrow('db');
    expect(ctx.mem.tables.cron_marks?.map((m) => m.key)).toEqual(['k2']);
  });
});
