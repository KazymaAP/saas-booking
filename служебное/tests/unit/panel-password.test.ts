// служебное/tests/unit/panel-password.test.ts — генератор временных паролей кабинета.
// Модуль лежит в .cjs (его требуют служебные скрипты), поэтому подключаем через createRequire.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { generatePanelPassword, ALPHABET } = require('../../scripts/lib/panel-password.cjs') as {
  generatePanelPassword: (length?: number) => string;
  ALPHABET: string;
};

describe('generatePanelPassword', () => {
  it('по умолчанию — 16 символов из разрешённого алфавита', () => {
    const password = generatePanelPassword();
    expect(password).toHaveLength(16);
    for (const ch of password) expect(ALPHABET).toContain(ch);
  });

  it('не содержит похожих символов: 0, O, o, 1, l, I', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generatePanelPassword()).not.toMatch(/[0Oo1lI]/);
    }
  });

  it('всегда есть строчная, заглавная и цифра — иначе часть провайдеров пароль отклонит', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generatePanelPassword();
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });

  it('пароли не повторяются', () => {
    const set = new Set(Array.from({ length: 500 }, () => generatePanelPassword()));
    expect(set.size).toBe(500);
  });

  it('слишком короткая длина — ошибка, а не слабый пароль', () => {
    expect(() => generatePanelPassword(8)).toThrow();
    expect(() => generatePanelPassword(11)).toThrow();
    expect(generatePanelPassword(12)).toHaveLength(12);
  });
});
