// lib/contrast.test.ts — текст поверх акцента: читаемый контраст и запасной вариант для мусора.
import { describe, expect, it } from 'vitest';
import { onAccentColor } from './contrast';

// Контраст по WCAG, для проверки «выбран лучший из двух».
function lum(input: string): number {
  // Короткий hex (#000) разворачиваем в полный: onAccentColor возвращает именно такой.
  const hex = input.length === 4 ? '#' + input.slice(1).split('').map((c) => c + c).join('') : input;
  const v = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const [r, g, b] = v.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('onAccentColor', () => {
  it('светлый акцент — чёрный текст, тёмный — белый', () => {
    expect(onAccentColor('#ffffff')).toBe('#000');
    expect(onAccentColor('#ffd400')).toBe('#000');
    expect(onAccentColor('#000000')).toBe('#fff');
    expect(onAccentColor('#1a1a2e')).toBe('#fff');
  });

  it('выбирает вариант с большим контрастом (для любого hex из проверочного набора)', () => {
    for (const c of ['#ff0000', '#00ff00', '#0000ff', '#808080', '#1a73e8', '#f5a623', '#7b2cbf']) {
      const picked = onAccentColor(c);
      const other = picked === '#000' ? '#fff' : '#000';
      expect(contrast(c, picked)).toBeGreaterThanOrEqual(contrast(c, other));
    }
  });

  it('короткий hex и регистр', () => {
    expect(onAccentColor('#fff')).toBe('#000');
    expect(onAccentColor('#FFFFFF')).toBe('#000');
    expect(onAccentColor(' #000 ')).toBe('#fff');
  });

  it('невалидный или пустой цвет — белый текст (прежнее поведение)', () => {
    expect(onAccentColor(null)).toBe('#fff');
    expect(onAccentColor(undefined)).toBe('#fff');
    expect(onAccentColor('red')).toBe('#fff');
    expect(onAccentColor('#12')).toBe('#fff');
    expect(onAccentColor(42 as unknown as string)).toBe('#fff');
  });
});
