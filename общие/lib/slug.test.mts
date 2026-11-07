// lib/slug.test.ts — транслит, slugify, уникальность (Vitest).
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_SLUG,
  MAX_SLUG_ATTEMPTS,
  MAX_SLUG_LENGTH,
  ensureUniqueSlug,
  isValidSlug,
  pickUniqueSlug,
  slugWithSuffix,
  slugify,
  transliterate,
} from './slug';

describe('transliterate', () => {
  it('переводит весь русский алфавит', () => {
    expect(transliterate('абвгдеёжзийклмнопрстуфхцчшщъыьэюя')).toBe(
      'abvgdeezhziyklmnoprstufkhtschshshchyeyuya',
    );
  });

  it('не зависит от регистра', () => {
    expect(transliterate('ШИНОМОНТАЖ')).toBe('shinomontazh');
  });

  it('переводит украинские и белорусские буквы', () => {
    expect(transliterate('Їжак Ґанок Єва Іра Ўсход')).toBe('yizhak ganok yeva ira uskhod');
  });

  it('оставляет латиницу и цифры', () => {
    expect(transliterate('Auto 24')).toBe('auto 24');
  });
});

describe('slugify', () => {
  it('кириллица → латиница через дефис', () => {
    expect(slugify('Шиномонтаж на Ленина')).toBe('shinomontazh-na-lenina');
  });

  it('спецсимволы схлопываются в один дефис', () => {
    expect(slugify('  #Покраска!!!Дисков__Екб  ')).toBe('pokraska-diskov-ekb');
  });

  it('эмодзи вырезаются', () => {
    expect(slugify('🛞 Шины 🚗')).toBe('shiny');
  });

  it('& и + становятся словами', () => {
    expect(slugify('Шины & Диски')).toBe('shiny-i-diski');
    expect(slugify('Сервис+')).toBe('servis-plus');
  });

  it('диакритика латиницы снимается', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('ъ и ь пропадают без дефиса', () => {
    expect(slugify('Подъезд Мельница')).toBe('podezd-melnitsa');
  });

  it('длина ограничена 60, без висящего дефиса', () => {
    const s = slugify('Очень длинное название шиномонтажа '.repeat(5));
    expect(s.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(s.endsWith('-')).toBe(false);
    expect(isValidSlug(s)).toBe(true);
  });

  it('пустая строка и мусор → fallback', () => {
    expect(slugify('')).toBe(FALLBACK_SLUG);
    expect(slugify('!!! 🙂 ---')).toBe(FALLBACK_SLUG);
  });

  it('результат всегда валиден', () => {
    for (const s of ['ООО «Ромашка»', 'A-1', '12 Шин', 'Ё-моё', 'x'.repeat(200)]) {
      expect(isValidSlug(slugify(s))).toBe(true);
    }
  });
});

describe('isValidSlug', () => {
  it('отклоняет неверные значения', () => {
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('-a')).toBe(false);
    expect(isValidSlug('a--b')).toBe(false);
    expect(isValidSlug('Abc')).toBe(false);
    expect(isValidSlug('a'.repeat(61))).toBe(false);
  });

  it('принимает корректные', () => {
    expect(isValidSlug('shina-24')).toBe(true);
  });
});

describe('slugWithSuffix', () => {
  it('обрезает root под суффикс', () => {
    const root = 'a'.repeat(MAX_SLUG_LENGTH);
    const s = slugWithSuffix(root, 12);
    expect(s.length).toBe(MAX_SLUG_LENGTH);
    expect(s.endsWith('-12')).toBe(true);
  });

  it('не оставляет двойной дефис после обрезки', () => {
    const root = `${'a'.repeat(57)}-bb`;
    expect(slugWithSuffix(root, 2)).toBe(`${'a'.repeat(57)}-2`);
  });
});

describe('ensureUniqueSlug', () => {
  it('возвращает базовый slug, если свободен', async () => {
    await expect(ensureUniqueSlug('Шина', async () => false)).resolves.toBe('shina');
  });

  it('подбирает суффикс -2, -3', async () => {
    const taken = new Set(['shina', 'shina-2']);
    await expect(ensureUniqueSlug('Шина', async (c) => taken.has(c))).resolves.toBe('shina-3');
  });

  it('длинный slug с суффиксом не превышает 60', async () => {
    const base = 'Ш'.repeat(100);
    const root = slugify(base);
    const s = await ensureUniqueSlug(base, async (c) => c === root);
    expect(s.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(s.endsWith('-2')).toBe(true);
  });

  it('бросает ошибку после MAX_SLUG_ATTEMPTS', async () => {
    let calls = 0;
    await expect(ensureUniqueSlug('x', async () => { calls++; return true; })).rejects.toThrow('slug');
    expect(calls).toBe(MAX_SLUG_ATTEMPTS);
  });
});

describe('pickUniqueSlug', () => {
  it('выдаёт разные slug для одинаковых имён в пачке', () => {
    const taken = new Set<string>();
    expect(pickUniqueSlug('Шина', taken)).toBe('shina');
    expect(pickUniqueSlug('Шина', taken)).toBe('shina-2');
    expect(pickUniqueSlug('ШИНА', taken)).toBe('shina-3');
    expect(taken.size).toBe(3);
  });

  it('учитывает заранее занятые slug', () => {
    const taken = new Set(['shina']);
    expect(pickUniqueSlug('Шина', taken)).toBe('shina-2');
  });

  it('бросает ошибку при исчерпании попыток', () => {
    const taken = new Set<string>(['x']);
    for (let n = 2; n <= MAX_SLUG_ATTEMPTS; n++) taken.add(`x-${n}`);
    expect(() => pickUniqueSlug('x', taken)).toThrow('slug');
  });
});
