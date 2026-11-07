// lib/phone.test.ts — нормализация, валидация, маска и маскирование телефона для логов.
import { describe, expect, it } from 'vitest';
import { formatPhoneMask, isValidPhone, maskPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['+79991234567', '+79991234567'],
    ['89991234567', '+79991234567'],
    ['79991234567', '+79991234567'],
    ['9991234567', '+79991234567'],
    ['+7 (999) 123-45-67', '+79991234567'],
    ['8 (999) 123 45 67', '+79991234567'],
    ['  +7-999-123-45-67  ', '+79991234567'],
    ['+7 (727) 123-45-67', '+77271234567'], // Казахстан — тот же код страны
  ])('распознаёт %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['+7'],
    ['12345'],
    ['999123456'], // 9 цифр
    ['+799912345678'], // 12 цифр — длинный
    ['+7999123456789012'], // очень длинный
    ['+19991234567'], // 11 цифр, но не 7/8 — США
    ['+44 20 7946 0958'], // международный не-РФ
    ['+70991234567'], // код зоны с 0
    ['1234567890'], // 10 цифр, начинается с 1
    ['2234567890'], // 10 цифр, начинается с 2
  ])('отклоняет %j', (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe('isValidPhone', () => {
  it('true для валидного и false для мусора', () => {
    expect(isValidPhone('+7 999 123-45-67')).toBe(true);
    expect(isValidPhone('мусор')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});

describe('formatPhoneMask', () => {
  it.each([
    ['', '+7'],
    ['+7', '+7'],
    ['7', '+7'],
    ['8', '+7'],
    ['9', '+7 (9'],
    ['99', '+7 (99'],
    ['999', '+7 (999'],
    ['9991', '+7 (999) 1'],
    ['999123', '+7 (999) 123'],
    ['9991234', '+7 (999) 123-4'],
    ['99912345', '+7 (999) 123-45'],
    ['999123456', '+7 (999) 123-45-6'],
    ['9991234567', '+7 (999) 123-45-67'],
    ['89991234567', '+7 (999) 123-45-67'],
    ['+79991234567', '+7 (999) 123-45-67'],
    ['+7 (999) 123-45-6789', '+7 (999) 123-45-67'], // лишнее обрезается
    ['abc', '+7'],
  ])('%j → %j', (raw, expected) => {
    expect(formatPhoneMask(raw)).toBe(expected);
  });

  it('Backspace после «)» стирает скобку, а не залипает', () => {
    // Пользователь видит «+7 (999» и стирает последнюю цифру.
    expect(formatPhoneMask('+7 (99')).toBe('+7 (99');
    expect(formatPhoneMask(formatPhoneMask('9991').slice(0, -1))).toBe('+7 (999');
  });

  it('идемпотентна: маска от маски не меняется', () => {
    const once = formatPhoneMask('89991234567');
    expect(formatPhoneMask(once)).toBe(once);
  });

  it('результат полной маски проходит normalizePhone', () => {
    expect(normalizePhone(formatPhoneMask('9991234567'))).toBe('+79991234567');
  });
});

describe('maskPhone', () => {
  it('оставляет только 4 последние цифры', () => {
    expect(maskPhone('+79991234567')).toBe('+*******4567');
  });
  it('пустое, null и короткое — ***', () => {
    expect(maskPhone('')).toBe('***');
    expect(maskPhone(null)).toBe('***');
    expect(maskPhone(undefined)).toBe('***');
    expect(maskPhone('1234')).toBe('***');
  });
});

describe('NORMALIZED_PHONE_RE', () => {
  it('матчит любой результат normalizePhone', async () => {
    const { NORMALIZED_PHONE_RE } = await import('./phone');
    for (const raw of ['89991234567', '9991234567', '+7 (999) 123-45-67']) {
      expect(NORMALIZED_PHONE_RE.test(normalizePhone(raw) ?? '')).toBe(true);
    }
  });
});
