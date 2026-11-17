// partners-renewal.test.ts — конец оплаченного периода при продлении.
// Регрессия: дата считалась как «сейчас + 30 дней», поэтому досрочная оплата съедала остаток
// уже оплаченного периода (клиент платил за 30 дней, получал меньше).
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Модуль тянет серверный Supabase — в unit-тесте он не нужен.
vi.mock('./supabase', () => ({ adminClient: () => { throw new Error('Supabase в unit-тестах не используется'); } }));

import { appliedUntilDate, renewalEndDate } from './partners';

const NOW = new Date('2026-11-17T10:00:00Z');

describe('renewalEndDate', () => {
  it('первая оплата: 30 дней от текущей даты', () => {
    expect(renewalEndDate(null, NOW)).toBe('2026-12-17');
  });

  it('досрочная оплата: продлевает от текущей даты окончания, а не от «сейчас»', () => {
    // Оплачено до 1 декабря, платит 17 ноября — должен получить 31 декабря, а не 17 декабря.
    expect(renewalEndDate('2026-12-01', NOW)).toBe('2026-12-31');
  });

  it('просроченная подписка: отсчёт от «сейчас», а не от прошлого', () => {
    expect(renewalEndDate('2026-10-01', NOW)).toBe('2026-12-17');
  });

  it('битая дата в БД не ломает расчёт', () => {
    expect(renewalEndDate('не дата', NOW)).toBe('2026-12-17');
  });

  it('срок настраивается', () => {
    expect(renewalEndDate(null, NOW, 7)).toBe('2026-11-24');
  });
});

describe('appliedUntilDate: повторная доставка вебхука не продлевает второй раз', () => {
  it('платёж уже записан — берём его дату, а не считаем от уже продлённой', () => {
    // Первый проход продлил до 17 декабря. Вебхук пришёл снова: currentUntil уже 17 декабря,
    // наивный расчёт дал бы 16 января (два месяца за один платёж). Берём записанную дату.
    expect(appliedUntilDate('2026-12-17', '2026-12-17', NOW)).toBe('2026-12-17');
  });

  it('платежа нет — обычное продление', () => {
    expect(appliedUntilDate(null, '2026-12-01', NOW)).toBe('2026-12-31');
  });

  it('пустой period_end у разовой продажи не ломает расчёт', () => {
    expect(appliedUntilDate(null, null, NOW)).toBe('2026-12-17');
  });
});

describe('порядок записи в markCheckoutPaid', () => {
  const source = readFileSync(fileURLToPath(new URL('./partners.ts', import.meta.url)), 'utf8');
  const body = source.slice(source.indexOf('export async function markCheckoutPaid'));

  it('строка payments пишется до обновления бизнеса', () => {
    // Иначе падение между активацией и записью платежа теряло бы активацию,
    // а повторный запуск не смог бы восстановить дату окончания.
    const payAt = body.indexOf("from('payments').insert");
    const bizAt = body.indexOf("from('businesses').update(bizPatch)");
    expect(payAt).toBeGreaterThan(0);
    expect(bizAt).toBeGreaterThan(0);
    expect(payAt).toBeLessThan(bizAt);
  });

  it('связь бизнеса с чекаутом фиксируется сразу после создания', () => {
    const created = body.indexOf('createBusinessForEntrepreneur(name, email, phone)');
    const linked = body.indexOf("from('partner_checkouts').update({ business_id: businessId })");
    expect(created).toBeGreaterThan(0);
    expect(linked).toBeGreaterThan(created);
  });
});
