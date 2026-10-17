// lib/slots.test.ts — расчёт слотов: рабочие часы, обед, буферы, окна записи, выходные, пояса, полночь.
import { describe, expect, it } from 'vitest';
import {
  addDays, dayBoundsUtc, formatSlotDateTime, formatSlotTime, freeSlots, isSlotFree, isValidTimeZone,
  localDateOf, parseDate, tzOffsetMinutes, type SlotInput,
} from './slots';
import type { WorkingHours } from './database.types';

// 2026-10-15 — четверг. Понедельник 2026-10-19 — основной тестовый день.
const NOW = Date.parse('2026-10-15T06:00:00Z'); // 09:00 по Москве
const MON = '2026-10-19';
const WEEK: WorkingHours = {
  mon: [{ open: '10:00', close: '14:00' }],
  tue: [{ open: '10:00', close: '13:00' }, { open: '14:00', close: '18:00' }],
  sun: null,
};

function msk(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00+03:00`);
}
function times(slots: number[], tz = 'Europe/Moscow'): string[] {
  return slots.map((ms) => formatSlotTime(new Date(ms).toISOString(), tz));
}
function base(over: Partial<SlotInput> = {}): SlotInput {
  return {
    date: MON, workingHours: WEEK, durationMinutes: 60, stepMinutes: 60, busy: [],
    nowMs: NOW, minHoursBefore: 2, maxDaysAhead: 30, ...over,
  };
}

describe('freeSlots — рабочие часы', () => {
  it('слоты по шагу внутри интервала, услуга не пересекает close', () => {
    expect(times(freeSlots(base()))).toEqual(['10:00', '11:00', '12:00', '13:00']);
  });

  it('шаг 30 минут при услуге 60 минут — последний слот 13:00', () => {
    expect(times(freeSlots(base({ stepMinutes: 30 })))).toEqual(['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00']);
  });

  it('обед: два интервала, услуга не перескакивает перерыв', () => {
    const slots = times(freeSlots(base({ date: '2026-10-20', durationMinutes: 90, stepMinutes: 30 })));
    expect(slots).toEqual(['10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30']);
    expect(slots).not.toContain('12:00'); // 12:00–13:30 пересёк бы обед
  });

  it('услуга не влезает ни в один интервал — пусто', () => {
    expect(freeSlots(base({ durationMinutes: 300 }))).toEqual([]);
  });

  it('выходной: null, отсутствующий ключ и пустой working_hours', () => {
    expect(freeSlots(base({ date: '2026-10-18' }))).toEqual([]); // sun: null
    expect(freeSlots(base({ date: '2026-10-21' }))).toEqual([]); // wed нет
    expect(freeSlots(base({ workingHours: null }))).toEqual([]);
  });

  it('битые интервалы пропускаются, нормальные работают', () => {
    const wh: WorkingHours = { mon: [{ open: 'xx', close: '12:00' }, { open: '25:00', close: '26:00' }, { open: '10:00', close: '11:00' }] };
    expect(times(freeSlots(base({ workingHours: wh })))).toEqual(['10:00']);
  });

  it('невалидные входы — пусто', () => {
    expect(freeSlots(base({ date: '2026-13-01' }))).toEqual([]);
    expect(freeSlots(base({ date: '2026-02-30' }))).toEqual([]);
    expect(freeSlots(base({ date: 'вчера' }))).toEqual([]);
    expect(freeSlots(base({ durationMinutes: 0 }))).toEqual([]);
    expect(freeSlots(base({ stepMinutes: 0 }))).toEqual([]);
  });

  it('пересекающиеся интервалы не дают дублей, результат отсортирован', () => {
    const wh: WorkingHours = { mon: [{ open: '12:00', close: '14:00' }, { open: '10:00', close: '13:00' }] };
    expect(times(freeSlots(base({ workingHours: wh })))).toEqual(['10:00', '11:00', '12:00', '13:00']);
  });
});

describe('freeSlots — брони и буферы', () => {
  it('пересечение с бронью исключает слот', () => {
    const busy = [{ start: msk(MON, '11:00'), end: msk(MON, '12:00') }];
    expect(times(freeSlots(base({ busy })))).toEqual(['10:00', '12:00', '13:00']);
  });

  it('частичное пересечение (бронь 11:30–12:30) убирает два слота', () => {
    const busy = [{ start: msk(MON, '11:30'), end: msk(MON, '12:30') }];
    expect(times(freeSlots(base({ busy })))).toEqual(['10:00', '13:00']);
  });

  it('стык без пересечения допустим: [10,11) и [11,12)', () => {
    const busy = [{ start: msk(MON, '10:00'), end: msk(MON, '11:00') }];
    expect(times(freeSlots(base({ busy })))).toContain('11:00');
  });

  it('буфер после новой услуги: уборка 15 мин не даёт встать впритык перед бронью', () => {
    const busy = [{ start: msk(MON, '12:00'), end: msk(MON, '13:00') }];
    expect(times(freeSlots(base({ busy, bufferAfterMinutes: 15 })))).toEqual(['10:00', '13:00']);
  });

  it('буфер до новой услуги: подготовка 15 мин не даёт встать сразу после брони', () => {
    const busy = [{ start: msk(MON, '10:00'), end: msk(MON, '11:00') }];
    expect(times(freeSlots(base({ busy, bufferBeforeMinutes: 15 })))).toEqual(['12:00', '13:00']);
  });

  it('буферы существующей брони тоже учитываются', () => {
    const busy = [{ start: msk(MON, '11:00'), end: msk(MON, '12:00'), bufferBefore: 10, bufferAfter: 10 }];
    expect(times(freeSlots(base({ busy })))).toEqual(['13:00']);
  });

  it('полностью занятый день — пусто', () => {
    const busy = [{ start: msk(MON, '10:00'), end: msk(MON, '14:00') }];
    expect(freeSlots(base({ busy }))).toEqual([]);
  });

  it('бронь в другой день не влияет', () => {
    const busy = [{ start: msk('2026-10-20', '10:00'), end: msk('2026-10-20', '14:00') }];
    expect(freeSlots(base({ busy }))).toHaveLength(4);
  });
});

describe('freeSlots — окна записи', () => {
  it('min_hours_before: сегодня в 09:00 при запасе 2 ч первый слот 11:00', () => {
    const thu: WorkingHours = { thu: [{ open: '09:00', close: '14:00' }] };
    expect(times(freeSlots(base({ date: '2026-10-15', workingHours: thu })))).toEqual(['11:00', '12:00', '13:00']);
  });

  it('min_hours_before ровно на границе слот допускается', () => {
    const thu: WorkingHours = { thu: [{ open: '11:00', close: '12:00' }] };
    expect(freeSlots(base({ date: '2026-10-15', workingHours: thu }))).toHaveLength(1);
  });

  it('прошедший день — пусто', () => {
    const wed: WorkingHours = { wed: [{ open: '10:00', close: '14:00' }] };
    expect(freeSlots(base({ date: '2026-10-14', workingHours: wed }))).toEqual([]);
  });

  it('max_days_ahead: последний доступный день включительно, следующий — нет', () => {
    const all: WorkingHours = { mon: WEEK.mon, tue: WEEK.mon, wed: WEEK.mon, thu: WEEK.mon, fri: WEEK.mon, sat: WEEK.mon, sun: WEEK.mon };
    expect(freeSlots(base({ workingHours: all, maxDaysAhead: 4, date: '2026-10-19' }))).toHaveLength(4);
    expect(freeSlots(base({ workingHours: all, maxDaysAhead: 4, date: '2026-10-20' }))).toEqual([]);
  });

  it('max_days_ahead = 0 — только сегодня', () => {
    const all: WorkingHours = { thu: [{ open: '12:00', close: '14:00' }], fri: [{ open: '12:00', close: '14:00' }] };
    expect(freeSlots(base({ workingHours: all, maxDaysAhead: 0, date: '2026-10-15' }))).toHaveLength(2);
    expect(freeSlots(base({ workingHours: all, maxDaysAhead: 0, date: '2026-10-16' }))).toEqual([]);
  });

  it('business_holidays: день-исключение без слотов', () => {
    expect(freeSlots(base({ holidays: ['2026-10-19'] }))).toEqual([]);
    expect(freeSlots(base({ holidays: ['2026-10-20'] }))).toHaveLength(4);
  });
});

describe('freeSlots — часовые пояса', () => {
  it('IANA пояс: Екатеринбург (UTC+5) — 10:00 местного = 05:00Z', () => {
    const slots = freeSlots(base({ timeZone: 'Asia/Yekaterinburg' }));
    expect(new Date(slots[0]).toISOString()).toBe('2026-10-19T05:00:00.000Z');
    expect(times(slots, 'Asia/Yekaterinburg')[0]).toBe('10:00');
  });

  it('фиксированное смещение offsetMinutes (устаревший режим)', () => {
    const slots = freeSlots(base({ offsetMinutes: 0 }));
    expect(new Date(slots[0]).toISOString()).toBe('2026-10-19T10:00:00.000Z');
  });

  it('неизвестный пояс → дефолт Europe/Moscow', () => {
    const slots = freeSlots(base({ timeZone: 'Mars/Olympus' }));
    expect(new Date(slots[0]).toISOString()).toBe('2026-10-19T07:00:00.000Z');
  });

  it('по умолчанию — Москва', () => {
    expect(new Date(freeSlots(base())[0]).toISOString()).toBe('2026-10-19T07:00:00.000Z');
  });

  it('DST: в день перевода часов (Берлин, 25.10.2026) слоты по местному времени', () => {
    const sun: WorkingHours = { sun: [{ open: '01:00', close: '05:00' }] };
    const slots = freeSlots(base({ date: '2026-10-25', workingHours: sun, timeZone: 'Europe/Berlin' }));
    // 01:00 CEST = 23:00Z; 03:00 CET = 02:00Z. В 25-часовом дне 02:00 встречается дважды.
    expect(new Date(slots[0]).toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(new Date(slots[slots.length - 1]).toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });

  it('DST весной (Берлин, 29.03.2026): несуществующее 02:30 не ломает расчёт', () => {
    const sun: WorkingHours = { sun: [{ open: '01:00', close: '05:00' }] };
    const slots = freeSlots(base({ date: '2026-03-29', workingHours: sun, timeZone: 'Europe/Berlin', nowMs: Date.parse('2026-03-20T00:00:00Z') }));
    expect(slots.length).toBeGreaterThan(0);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('дата выбирается по календарю бизнеса, а не UTC: Владивосток утром', () => {
    // 2026-10-15T20:00Z — во Владивостоке (UTC+10) уже 16-е, 06:00.
    const fri: WorkingHours = { fri: [{ open: '10:00', close: '12:00' }] };
    const slots = freeSlots(base({ date: '2026-10-16', workingHours: fri, timeZone: 'Asia/Vladivostok', nowMs: Date.parse('2026-10-15T20:00:00Z'), maxDaysAhead: 0, minHoursBefore: 0 }));
    expect(slots).toHaveLength(2);
  });
});

describe('freeSlots — переход через полночь', () => {
  it('ночной интервал 22:00–02:00 — слоты до 01:00 следующего дня', () => {
    const night: WorkingHours = { mon: [{ open: '22:00', close: '02:00' }] };
    const slots = freeSlots(base({ workingHours: night }));
    expect(times(slots)).toEqual(['22:00', '23:00', '00:00', '01:00']);
    expect(new Date(slots[3]).toISOString()).toBe('2026-10-19T22:00:00.000Z'); // 01:00 МСК 20-го
  });

  it('close = 24:00 — до полуночи', () => {
    const late: WorkingHours = { mon: [{ open: '22:00', close: '24:00' }] };
    expect(times(freeSlots(base({ workingHours: late })))).toEqual(['22:00', '23:00']);
  });

  it('ночная бронь после полуночи блокирует слот', () => {
    const night: WorkingHours = { mon: [{ open: '22:00', close: '02:00' }] };
    const busy = [{ start: msk('2026-10-20', '00:00'), end: msk('2026-10-20', '01:00') }];
    expect(times(freeSlots(base({ workingHours: night, busy })))).toEqual(['22:00', '23:00', '01:00']);
  });
});

describe('isSlotFree', () => {
  it('true для свободного, false для занятого и вне сетки', () => {
    expect(isSlotFree(base(), msk(MON, '10:00'))).toBe(true);
    expect(isSlotFree(base(), msk(MON, '10:15'))).toBe(false);
    expect(isSlotFree(base({ busy: [{ start: msk(MON, '10:00'), end: msk(MON, '11:00') }] }), msk(MON, '10:00'))).toBe(false);
  });
});

describe('вспомогательные функции дат', () => {
  it('parseDate', () => {
    expect(parseDate('2026-10-19')).toBe(Date.UTC(2026, 9, 19));
    expect(parseDate('2026-02-29')).toBeNull();
    expect(parseDate('2028-02-29')).toBe(Date.UTC(2028, 1, 29));
    expect(parseDate('19.10.2026')).toBeNull();
  });

  it('addDays через границу месяца и года; невалидная дата возвращается как есть', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('oops', 1)).toBe('oops');
  });

  it('localDateOf учитывает пояс', () => {
    const ms = Date.parse('2026-10-15T22:30:00Z');
    expect(localDateOf(ms)).toBe('2026-10-16'); // 01:30 МСК
    expect(localDateOf(ms, 'UTC')).toBe('2026-10-15');
  });

  it('dayBoundsUtc: Москва и невалидная дата', () => {
    expect(dayBoundsUtc(MON)).toEqual({ start: Date.parse('2026-10-18T21:00:00Z'), end: Date.parse('2026-10-19T21:00:00Z') });
    expect(dayBoundsUtc('bad')).toBeNull();
  });

  it('dayBoundsUtc: 25-часовой день в Берлине', () => {
    const b = dayBoundsUtc('2026-10-25', 'Europe/Berlin');
    expect(b && (b.end - b.start) / 3_600_000).toBe(25);
  });

  it('tzOffsetMinutes и isValidTimeZone', () => {
    expect(tzOffsetMinutes('Europe/Moscow', NOW)).toBe(180);
    expect(tzOffsetMinutes('UTC', NOW + 123)).toBe(0);
    expect(tzOffsetMinutes('Asia/Kolkata', NOW)).toBe(330);
    expect(isValidTimeZone('Europe/Moscow')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });

  it('formatSlotTime / formatSlotDateTime', () => {
    expect(formatSlotTime('2026-10-19T07:00:00.000Z')).toBe('10:00');
    expect(formatSlotDateTime('2026-10-19T07:00:00.000Z')).toMatch(/19 октября.*10:00/);
  });
});
