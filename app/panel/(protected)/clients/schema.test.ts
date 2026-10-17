// Тесты чистой логики раздела «Клиенты»: продление, предсказание optimistic-изменений, доступные кнопки.
import { describe, expect, it } from 'vitest';
import { accessSchema, allowedOps, extendFrom, predictPatch } from './schema';

const NOW = new Date('2026-10-15T12:00:00Z');

describe('extendFrom', () => {
  it('продлевает от будущей даты окончания', () => {
    expect(extendFrom('2026-10-20', NOW)).toBe('2026-11-19');
  });
  it('после просрочки продлевает от сегодня', () => {
    expect(extendFrom('2026-09-01', NOW)).toBe('2026-11-14');
  });
  it('без даты — от сегодня', () => {
    expect(extendFrom(null, NOW)).toBe('2026-11-14');
  });
});

describe('predictPatch', () => {
  it('оплата делает клиентом на 30 дней с ценой из настроек', () => {
    const p = predictPatch('paid', { subscription_until: null }, NOW, 1500);
    expect(p).toMatchObject({ status: 'client', subscription_active: true, subscription_until: '2026-11-14', subscription_price: 1500 });
  });
  it('отказ убирает строку из списка', () => {
    expect(predictPatch('refuse', { subscription_until: null }, NOW)).toEqual({ status: 'refused', removed: true });
  });
  it('передача кода ставит поддержку на 30 дней', () => {
    expect(predictPatch('transfer', { subscription_until: null }, NOW).support_until).toBe('2026-11-14');
  });
  it('напоминание ничего не меняет в строке', () => {
    expect(predictPatch('remind', { subscription_until: '2026-10-20' }, NOW)).toEqual({});
  });
});

describe('allowedOps', () => {
  const base = { subscription_active: true, has_email: true, code_transferred_at: null };
  it('кандидату — оплата и отказ', () => {
    expect(allowedOps({ ...base, status: 'sent' })).toEqual(['paid', 'refuse']);
  });
  it('активному клиенту — продление, отключение, напоминание, передача', () => {
    expect(allowedOps({ ...base, status: 'client' })).toEqual(['extend', 'disable', 'remind', 'transfer']);
  });
  it('без email нет «Напомнить», после передачи нет «Передать код»', () => {
    expect(allowedOps({ status: 'client', subscription_active: false, has_email: false, code_transferred_at: '2026-10-01' })).toEqual(['extend']);
  });
  it('код передан / удалён — действий нет', () => {
    expect(allowedOps({ ...base, status: 'transferred_out' })).toEqual([]);
  });
});

describe('accessSchema', () => {
  it('нормализует email', () => {
    const r = accessSchema.safeParse({ id: '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', email: '  Owner@Mail.RU ' });
    expect(r.success && r.data.email).toBe('owner@mail.ru');
  });
  it('отклоняет пустой и кривой email с сообщением под полем', () => {
    const r = accessSchema.safeParse({ id: '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', email: 'нет' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['email']);
  });
});
