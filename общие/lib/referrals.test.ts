// общие/lib/referrals.test.ts — расчёт бонуса наставнику (чистая функция, без базы).
import { describe, expect, it } from 'vitest';
import { bonusAmount, DEFAULT_REFERRAL_PERCENT } from './referrals';

describe('bonusAmount', () => {
  it('по умолчанию 10% от начисления партнёра', () => {
    expect(bonusAmount(1000, DEFAULT_REFERRAL_PERCENT)).toBe(100);
    expect(bonusAmount(2500, DEFAULT_REFERRAL_PERCENT)).toBe(250);
  });

  it('округляет до копеек', () => {
    expect(bonusAmount(333.33, 10)).toBe(33.33);
    expect(bonusAmount(0.05, 10)).toBe(0.01);
  });

  it('не начисляет на нулевые и некорректные суммы', () => {
    expect(bonusAmount(0, 10)).toBe(0);
    expect(bonusAmount(-100, 10)).toBe(0);
    expect(bonusAmount(Number.NaN, 10)).toBe(0);
    expect(bonusAmount(1000, 0)).toBe(0);
    expect(bonusAmount(1000, Number.NaN)).toBe(0);
  });

  it('процент настраивается', () => {
    expect(bonusAmount(1000, 12)).toBe(120);
    expect(bonusAmount(1000, 100)).toBe(1000);
  });
});
