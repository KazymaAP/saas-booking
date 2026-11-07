// lib/hours.test.ts — тесты разбора рабочего времени (Vitest). Цель — 100% покрытие lib/hours.ts.
import { describe, expect, it } from 'vitest';
import {
  DAY_KEYS,
  DAY_LABELS,
  MAX_INPUT_LENGTH,
  MAX_INTERVALS_PER_DAY,
  formatIntervals,
  hasWorkingDays,
  normalizeIntervals,
  parseIntervals,
  parseWorkingHours,
  validateIntervals,
} from './hours';

describe('parseIntervals — валидные строки', () => {
  it('один интервал', () => {
    expect(parseIntervals('09:00-18:00')).toEqual([{ open: '09:00', close: '18:00' }]);
  });

  it('несколько интервалов через запятую', () => {
    expect(parseIntervals('09:00-13:00, 14:00-21:00')).toEqual([
      { open: '09:00', close: '13:00' },
      { open: '14:00', close: '21:00' },
    ]);
  });

  it('точка с запятой как разделитель', () => {
    expect(parseIntervals('09:00-13:00; 14:00-21:00')).toHaveLength(2);
  });

  it('пробелы вокруг и внутри', () => {
    expect(parseIntervals('   09:00 - 13:00 ,   14:00-  21:00  ')).toEqual([
      { open: '09:00', close: '13:00' },
      { open: '14:00', close: '21:00' },
    ]);
  });

  it('скобки снаружи и у каждого интервала', () => {
    expect(parseIntervals('(09:00-18:00)')).toEqual([{ open: '09:00', close: '18:00' }]);
    expect(parseIntervals('[10:00-14:00], {15:00-19:00}')).toHaveLength(2);
  });

  it('однозначный час и точка вместо двоеточия нормализуются', () => {
    expect(parseIntervals('9:00-18.30')).toEqual([{ open: '09:00', close: '18:30' }]);
  });

  it('тире и «до» как разделители', () => {
    expect(parseIntervals('09:00–18:00')).toEqual([{ open: '09:00', close: '18:00' }]);
    expect(parseIntervals('09:00—18:00')).toEqual([{ open: '09:00', close: '18:00' }]);
    expect(parseIntervals('09:00 до 18:00')).toEqual([{ open: '09:00', close: '18:00' }]);
  });

  it('интервалы сортируются по началу', () => {
    expect(parseIntervals('14:00-21:00, 09:00-13:00')).toEqual([
      { open: '09:00', close: '13:00' },
      { open: '14:00', close: '21:00' },
    ]);
  });

  it('стык интервалов без перерыва допустим', () => {
    expect(parseIntervals('09:00-13:00, 13:00-18:00')).toHaveLength(2);
  });

  it('пустые части между запятыми игнорируются', () => {
    expect(parseIntervals('09:00-13:00,,')).toEqual([{ open: '09:00', close: '13:00' }]);
  });
});

describe('parseIntervals — границы', () => {
  it('00:00-24:00 — круглосуточно', () => {
    expect(parseIntervals('00:00-24:00')).toEqual([{ open: '00:00', close: '24:00' }]);
  });

  it('00:00-23:59', () => {
    expect(parseIntervals('00:00-23:59')).toEqual([{ open: '00:00', close: '23:59' }]);
  });

  it('24:00 нельзя как начало', () => {
    expect(parseIntervals('24:00-24:00')).toBe('invalid');
  });

  it('24:30 нельзя даже как конец', () => {
    expect(parseIntervals('10:00-24:30')).toBe('invalid');
  });

  it('ровно MAX_INTERVALS_PER_DAY интервалов — можно, на один больше — нельзя', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => `${String(i * 2).padStart(2, '0')}:00-${String(i * 2 + 1).padStart(2, '0')}:00`).join(', ');
    expect(parseIntervals(make(MAX_INTERVALS_PER_DAY))).toHaveLength(MAX_INTERVALS_PER_DAY);
    expect(validateIntervals(make(MAX_INTERVALS_PER_DAY + 1))).toEqual({ ok: false, error: `Не больше ${MAX_INTERVALS_PER_DAY} интервалов в день` });
  });

  it('слишком длинная строка', () => {
    const raw = `09:00-10:00${' '.repeat(MAX_INPUT_LENGTH)}`;
    expect(validateIntervals(raw)).toEqual({ ok: false, error: 'Слишком длинная строка' });
  });
});

describe('parseIntervals — пустые значения = выходной', () => {
  it.each(['', '   ', 'выходной', 'Выходной', 'вых', 'закрыто', '-', '—', '()'])('%j → null', (raw) => {
    expect(parseIntervals(raw)).toBeNull();
  });
});

describe('parseIntervals — невалидные строки', () => {
  it.each([
    'abc',
    '09:00',
    '09:00-',
    '0900-1800',
    '9-18',
    '25:00-26:00',
    '09:60-18:00',
    '09:00-18:75',
    '18:00-09:00',
    '10:00-10:00',
    '09:00-13:00 14:00-18:00',
  ])('%j → invalid', (raw) => {
    expect(parseIntervals(raw)).toBe('invalid');
  });
});

describe('validateIntervals — тексты ошибок', () => {
  it('формат', () => {
    expect(validateIntervals('abc')).toEqual({ ok: false, error: '«abc» — нужен формат 09:00-18:00' });
  });
  it('несуществующее время', () => {
    expect(validateIntervals('25:00-26:00')).toEqual({ ok: false, error: '«25:00-26:00» — такого времени нет' });
  });
  it('начало позже конца', () => {
    expect(validateIntervals('18:00-09:00')).toEqual({ ok: false, error: '«18:00-09:00» — начало должно быть раньше конца' });
  });
  it('пересечение', () => {
    expect(validateIntervals('09:00-14:00, 13:00-18:00')).toEqual({ ok: false, error: 'Интервалы пересекаются' });
  });
  it('ok-результат', () => {
    expect(validateIntervals('10:00-11:00')).toEqual({ ok: true, value: [{ open: '10:00', close: '11:00' }] });
  });
});

describe('formatIntervals', () => {
  it('null/undefined/пустой массив → пустая строка', () => {
    expect(formatIntervals(null)).toBe('');
    expect(formatIntervals(undefined)).toBe('');
    expect(formatIntervals([])).toBe('');
  });
  it('один и несколько интервалов', () => {
    expect(formatIntervals([{ open: '09:00', close: '18:00' }])).toBe('09:00-18:00');
    expect(formatIntervals([{ open: '09:00', close: '13:00' }, { open: '14:00', close: '21:00' }])).toBe('09:00-13:00, 14:00-21:00');
  });
  it('round-trip: format(parse(x)) стабилен', () => {
    const src = '9:00 - 13:00 ; 14.00-21:00';
    const parsed = parseIntervals(src);
    if (parsed === 'invalid' || parsed === null) throw new Error('ожидались интервалы');
    expect(formatIntervals(parsed)).toBe('09:00-13:00, 14:00-21:00');
    expect(parseIntervals(formatIntervals(parsed))).toEqual(parsed);
  });
});

describe('parseWorkingHours', () => {
  it('вся неделя валидна', () => {
    const r = parseWorkingHours((d) => (d === 'sun' ? '' : '10:00-20:00'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mon).toEqual([{ open: '10:00', close: '20:00' }]);
    expect(r.value.sun).toBeNull();
    expect(Object.keys(r.value)).toEqual([...DAY_KEYS]);
  });
  it('ошибки собираются по каждому дню', () => {
    const r = parseWorkingHours((d) => (d === 'tue' || d === 'fri' ? 'bad' : ''));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['fri', 'tue']);
  });
});

describe('hasWorkingDays и DAY_LABELS', () => {
  it('нет часов', () => {
    expect(hasWorkingDays(null)).toBe(false);
    expect(hasWorkingDays(undefined)).toBe(false);
    expect(hasWorkingDays({})).toBe(false);
    expect(hasWorkingDays({ mon: null, tue: [] })).toBe(false);
  });
  it('есть хотя бы один рабочий день', () => {
    expect(hasWorkingDays({ sat: [{ open: '10:00', close: '12:00' }] })).toBe(true);
  });
  it('подписи для всех дней', () => {
    for (const d of DAY_KEYS) expect(DAY_LABELS[d].length).toBeGreaterThan(0);
  });
});


describe('normalizeIntervals — терпимость к формату из базы', () => {
  it('канон: массив {open, close} проходит как есть', () => {
    expect(normalizeIntervals([{ open: '09:00', close: '18:00' }])).toEqual([{ open: '09:00', close: '18:00' }]);
  });

  it('один объект вместо массива', () => {
    expect(normalizeIntervals({ open: '10:00', close: '20:00' })).toEqual([{ open: '10:00', close: '20:00' }]);
  });

  it('старые ключи from/to (импорт, демо-данные)', () => {
    expect(normalizeIntervals({ from: '10:00', to: '21:00' })).toEqual([{ open: '10:00', close: '21:00' }]);
  });

  it('строка «09:00-18:00, 19:00-21:00»', () => {
    expect(normalizeIntervals('09:00-18:00, 19:00-21:00')).toEqual([
      { open: '09:00', close: '18:00' },
      { open: '19:00', close: '21:00' },
    ]);
  });

  it('выходной и мусор дают пустой массив', () => {
    expect(normalizeIntervals(null)).toEqual([]);
    expect(normalizeIntervals(undefined)).toEqual([]);
    expect(normalizeIntervals('выходной')).toEqual([]);
    expect(normalizeIntervals({ open: 'нет', close: 'данных' })).toEqual([]);
    expect(normalizeIntervals(42)).toEqual([]);
  });
});
