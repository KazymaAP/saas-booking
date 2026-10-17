// Тесты схем настроек платформы: валидация реквизитов, цен, лимитов; чтение с дефолтами; diff полей.
import { describe, expect, it } from 'vitest';
import { changedPaths, DEFAULTS, luhnValid, rateLimitsSchema, readSettings, requisitesSchema, tariffsSchema } from './schema';

const emptyReq = { ...DEFAULTS.platform_requisites };

describe('requisitesSchema', () => {
  it('пустые реквизиты допустимы (ещё не заполнены)', () => {
    expect(requisitesSchema.safeParse(emptyReq).success).toBe(true);
  });
  it('ИНН — только 10 или 12 цифр', () => {
    expect(requisitesSchema.safeParse({ ...emptyReq, inn: '12345' }).success).toBe(false);
    expect(requisitesSchema.safeParse({ ...emptyReq, inn: '500100732259' }).success).toBe(true);
  });
  it('карта: пробелы убираются, проверка Луна, хранится группами по 4', () => {
    const r = requisitesSchema.safeParse({ ...emptyReq, card: '4111-1111-1111-1111' });
    expect(r.success && r.data.card).toBe('4111 1111 1111 1111');
    const bad = requisitesSchema.safeParse({ ...emptyReq, card: '4111 1111 1111 1112' });
    expect(bad.success).toBe(false);
  });
  it('телефон нормализуется в +7XXXXXXXXXX', () => {
    const r = requisitesSchema.safeParse({ ...emptyReq, phone: '8 (999) 123-45-67' });
    expect(r.success && r.data.phone).toBe('+79991234567');
  });
  it('email и ссылка «Мой налог» проверяются', () => {
    expect(requisitesSchema.safeParse({ ...emptyReq, email: 'нет' }).success).toBe(false);
    expect(requisitesSchema.safeParse({ ...emptyReq, nalog_url: 'javascript:alert(1)' }).success).toBe(false);
    expect(requisitesSchema.safeParse({ ...emptyReq, nalog_url: 'https://lknpd.nalog.ru/' }).success).toBe(true);
  });
});

describe('luhnValid', () => {
  it('эталонные номера', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
  });
});

describe('цены и лимиты', () => {
  it('цена — целые рубли ≥ 0, строки из формы приводятся', () => {
    const r = tariffsSchema.safeParse({ basic: { name: 'Базовый', price: '1000' }, pro: { name: 'Про', price: '2500' } });
    expect(r.success && r.data.basic.price).toBe(1000);
    expect(tariffsSchema.safeParse({ basic: { name: 'Б', price: '-1' }, pro: { name: 'П', price: '1' } }).success).toBe(false);
    expect(tariffsSchema.safeParse({ basic: { name: 'Б', price: '10.5' }, pro: { name: 'П', price: '1' } }).success).toBe(false);
  });
  it('пустое название тарифа — ошибка с путём basic.name', () => {
    const r = tariffsSchema.safeParse({ basic: { name: ' ', price: '1' }, pro: { name: 'П', price: '1' } });
    expect(!r.success && r.error.issues[0]?.path.join('.')).toBe('basic.name');
  });
  it('лимит 0 запрещён (заблокировал бы все брони)', () => {
    expect(rateLimitsSchema.safeParse({ booking_per_10min: '0', cancel_per_15min: '10' }).success).toBe(false);
    expect(rateLimitsSchema.safeParse({ booking_per_10min: 'abc', cancel_per_15min: '10' }).success).toBe(false);
  });
});

describe('readSettings', () => {
  it('нет записей — дефолты из seed', () => {
    expect(readSettings([])).toEqual(DEFAULTS);
  });
  it('битые поля заменяются дефолтом, корректные сохраняются', () => {
    const s = readSettings([
      { key: 'tariffs', value: { basic: { name: 'Старт', price: 'дорого' }, pro: null } },
      { key: 'feature_flags', value: 'мусор' },
    ]);
    expect(s.tariffs.basic).toEqual({ name: 'Старт', price: 1000 });
    expect(s.tariffs.pro).toEqual(DEFAULTS.tariffs.pro);
    expect(s.feature_flags).toEqual(DEFAULTS.feature_flags);
  });
});

describe('changedPaths', () => {
  it('вложенные пути, только изменённые', () => {
    expect(changedPaths({ basic: { price: 1000, name: 'Б' } }, { basic: { price: 1200, name: 'Б' } })).toEqual(['basic.price']);
  });
  it('нет старого значения — изменены все поля', () => {
    expect(changedPaths(null, { a: 1, b: 2 })).toEqual(['a', 'b']);
  });
  it('одинаковые значения — пусто', () => {
    expect(changedPaths({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
