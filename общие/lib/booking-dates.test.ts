// lib/booking-dates.test.ts — тесты выбора даты в форме записи (Vitest).
// Ловят два класса поломок: (1) календарь считается в поясе браузера вместо пояса бизнеса,
// (2) полоса дат и границы min/max расходятся, из-за чего шторка открывается на недоступном дне.
import { describe, expect, it } from 'vitest';
import {
  DATE_STRIP_DAYS,
  SCHEDULE_DEFAULTS,
  dateBounds,
  dateLabel,
  dateOptions,
  firstOpenDate,
  isClosedDay,
  isDateInBounds,
  resolveSchedule,
} from './booking-dates';
import type { WorkingHours } from './database.types';

const MON_NOON_UTC = Date.UTC(2026, 9, 19, 12, 0, 0); // пн, 19 октября 2026, 12:00 UTC
const DAY_MS = 86_400_000;

// График: пн–пт 09:00–18:00, сб/вс — выходной.
const WEEKDAYS: WorkingHours = {
  mon: [{ open: '09:00', close: '18:00' }],
  tue: [{ open: '09:00', close: '18:00' }],
  wed: [{ open: '09:00', close: '18:00' }],
  thu: [{ open: '09:00', close: '18:00' }],
  fri: [{ open: '09:00', close: '18:00' }],
  sat: [],
  sun: [],
};

describe('resolveSchedule — дефолты и защита от отрицательных значений', () => {
  it('без настроек отдаёт дефолты ТЗ §4.6', () => {
    const s = resolveSchedule(undefined);
    expect(s.timeZone).toBe(SCHEDULE_DEFAULTS.timeZone);
    expect(s.minHoursBefore).toBe(2);
    expect(s.maxDaysAhead).toBe(30);
    expect(s.workingHours).toBeNull();
  });

  it('отрицательные значения приводятся к нулю, а не ломают границы', () => {
    const s = resolveSchedule({ minHoursBefore: -5, maxDaysAhead: -1 });
    expect(s.minHoursBefore).toBe(0);
    expect(s.maxDaysAhead).toBe(0);
  });

  it('явные значения сохраняются', () => {
    const s = resolveSchedule({ timeZone: 'Asia/Novosibirsk', minHoursBefore: 24, maxDaysAhead: 7, workingHours: WEEKDAYS });
    expect(s).toMatchObject({ timeZone: 'Asia/Novosibirsk', minHoursBefore: 24, maxDaysAhead: 7 });
  });
});

describe('dateBounds — min сдвигается на minHoursBefore', () => {
  it('дневное время: min и max — сегодня и сегодня + maxDaysAhead', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 2, maxDaysAhead: 10 });
    expect(dateBounds(s, MON_NOON_UTC)).toEqual({ min: '2026-10-19', max: '2026-10-29' });
  });

  it('вечер: 23:00 + 2 часа уже завтра — min переезжает на завтра', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 2, maxDaysAhead: 10 });
    expect(dateBounds(s, Date.UTC(2026, 9, 19, 23, 0, 0)).min).toBe('2026-10-20');
  });

  it('minHoursBefore = 0 оставляет сегодняшний день', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 0, maxDaysAhead: 5 });
    expect(dateBounds(s, Date.UTC(2026, 9, 19, 23, 59, 0)).min).toBe('2026-10-19');
  });

  it('max считается от сегодняшнего дня, а не от min', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 5, maxDaysAhead: 3 });
    const bounds = dateBounds(s, Date.UTC(2026, 9, 19, 22, 0, 0));
    expect(bounds.min).toBe('2026-10-20');
    expect(bounds.max).toBe('2026-10-22');
  });

  it('календарь бизнеса, а не браузера: в Новосибирске уже завтра', () => {
    const s = resolveSchedule({ timeZone: 'Asia/Novosibirsk', minHoursBefore: 0, maxDaysAhead: 10 });
    // 19 октября 20:00 UTC = 20 октября 03:00 в Новосибирске (UTC+7).
    expect(dateBounds(s, Date.UTC(2026, 9, 19, 20, 0, 0)).min).toBe('2026-10-20');
  });
});

describe('isDateInBounds', () => {
  const bounds = { min: '2026-10-19', max: '2026-10-29' };

  it('границы включительно', () => {
    expect(isDateInBounds('2026-10-19', bounds)).toBe(true);
    expect(isDateInBounds('2026-10-29', bounds)).toBe(true);
  });

  it('за границами — false', () => {
    expect(isDateInBounds('2026-10-18', bounds)).toBe(false);
    expect(isDateInBounds('2026-10-30', bounds)).toBe(false);
  });

  it('пустая и мусорная строка — false, а не исключение', () => {
    expect(isDateInBounds('', bounds)).toBe(false);
    expect(isDateInBounds('19.10.2026', bounds)).toBe(false);
    expect(isDateInBounds('2026-02-31', bounds)).toBe(false);
  });
});

describe('isClosedDay — выходной по графику', () => {
  it('без графика все дни считаются рабочими', () => {
    expect(isClosedDay('2026-10-24', null)).toBe(false); // суббота
  });

  it('суббота и воскресенье закрыты', () => {
    expect(isClosedDay('2026-10-24', WEEKDAYS)).toBe(true);
    expect(isClosedDay('2026-10-25', WEEKDAYS)).toBe(true);
  });

  it('будни открыты', () => {
    expect(isClosedDay('2026-10-19', WEEKDAYS)).toBe(false);
    expect(isClosedDay('2026-10-23', WEEKDAYS)).toBe(false);
  });

  it('нестандартная форма значения дня не превращает день в выходной', () => {
    const broken = { ...WEEKDAYS, mon: { open: '09:00', close: '18:00' } } as unknown as WorkingHours;
    expect(isClosedDay('2026-10-19', broken)).toBe(false);
  });

  it('нераспознанная дата считается закрытой, а не падает', () => {
    expect(isClosedDay('не-дата', WEEKDAYS)).toBe(true);
  });
});

describe('dateOptions — полоса дат', () => {
  it('ровно DATE_STRIP_DAYS дней, начиная с min', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 0, maxDaysAhead: 30, workingHours: WEEKDAYS });
    const options = dateOptions(s, MON_NOON_UTC);
    expect(options).toHaveLength(DATE_STRIP_DAYS);
    expect(options[0].date).toBe('2026-10-19');
    expect(options[1].date).toBe('2026-10-20');
  });

  it('дни идут подряд без пропусков', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 0, maxDaysAhead: 30 });
    const options = dateOptions(s, MON_NOON_UTC);
    options.forEach((option, index) => {
      expect(option.date).toBe(new Date(MON_NOON_UTC + index * DAY_MS).toISOString().slice(0, 10));
    });
  });

  it('выходные помечены closed и подписаны для диктора', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 0, maxDaysAhead: 30, workingHours: WEEKDAYS });
    const saturday = dateOptions(s, MON_NOON_UTC).find((option) => option.date === '2026-10-24');
    expect(saturday?.closed).toBe(true);
    expect(saturday?.label).toContain('выходной');
  });

  it('maxDaysAhead ограничивает полосу сверху', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 0, maxDaysAhead: 2 });
    expect(dateOptions(s, MON_NOON_UTC)).toHaveLength(3);
  });

  it('maxDaysAhead = 0 — ровно один день', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 0, maxDaysAhead: 0 });
    expect(dateOptions(s, MON_NOON_UTC)).toHaveLength(1);
  });

  it('явный аргумент days переопределяет длину полосы', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 0, maxDaysAhead: 30 });
    expect(dateOptions(s, MON_NOON_UTC, 3)).toHaveLength(3);
  });

  it('подписи дня и месяца непустые', () => {
    const s = resolveSchedule({ timeZone: 'UTC', minHoursBefore: 0, maxDaysAhead: 30 });
    const [first] = dateOptions(s, MON_NOON_UTC);
    expect(first.weekday.length).toBeGreaterThan(0);
    expect(first.day).toBe('19');
    expect(first.month.length).toBeGreaterThan(0);
  });
});

describe('firstOpenDate — день по умолчанию', () => {
  const base = { weekday: 'пн', day: '19', month: 'окт', label: 'понедельник, 19 октября' };

  it('берёт первый рабочий день', () => {
    expect(
      firstOpenDate([
        { ...base, date: '2026-10-24', closed: true },
        { ...base, date: '2026-10-25', closed: true },
        { ...base, date: '2026-10-26', closed: false },
      ]),
    ).toBe('2026-10-26');
  });

  it('все дни закрыты — пустая строка, а не первый день', () => {
    expect(firstOpenDate([{ ...base, date: '2026-10-24', closed: true }])).toBe('');
  });

  it('пустой список — пустая строка', () => {
    expect(firstOpenDate([])).toBe('');
  });
});

describe('dateLabel — подпись для экранного диктора', () => {
  it('разворачивает дату в «день недели, число месяц»', () => {
    expect(dateLabel('2026-10-19')).toMatch(/понедельник/i);
    expect(dateLabel('2026-10-19')).toContain('19');
  });

  it('нераспознанную дату возвращает как есть, не падая', () => {
    expect(dateLabel('мусор')).toBe('мусор');
  });
});
