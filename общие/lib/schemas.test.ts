// lib/schemas.test.ts — общие zod-схемы flow бронирования: валидные, невалидные и граничные значения.
import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  bookingFormSchema,
  bookingInput,
  bookingCreated,
  cancelInput,
  cancelResponse,
  firstErrorField,
  parseApiError,
  reasonMessage,
  rescheduleInput,
  rescheduleResponse,
  slotsQuery,
  slotsResponse,
  REASON_MESSAGES,
  API_REASONS,
} from './schemas';

const SERVICE_ID = '7b0c1f1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f';
const TOKEN = '0f8fad5b-d9cb-469f-a165-70867728950e';

const validForm = {
  serviceId: SERVICE_ID,
  date: '2026-10-20',
  startsAt: '2026-10-20T07:00:00.000Z',
  name: 'Анна',
  phone: '+7 (999) 123-45-67',
  email: '',
  telegram: '',
  comment: '',
  privacyAccepted: true,
} as const;

const validInput = { ...validForm, prefix: 'b', slug: 'studio-1' };

function issuesOf(result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }): string[] {
  return result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
}

describe('bookingFormSchema', () => {
  it('принимает валидную форму', () => {
    expect(bookingFormSchema.safeParse(validForm).success).toBe(true);
  });

  it('обрезает пробелы в имени и телефоне', () => {
    const parsed = bookingFormSchema.parse({ ...validForm, name: '  Анна  ', phone: ' 89991234567 ' });
    expect(parsed.name).toBe('Анна');
    expect(parsed.phone).toBe('89991234567');
  });

  it('без согласия на ПДн — ошибка privacyAccepted', () => {
    const result = bookingFormSchema.safeParse({ ...validForm, privacyAccepted: false });
    expect(issuesOf(result)).toEqual(['privacyAccepted']);
  });

  it('согласие строкой "true" не принимается (только boolean true)', () => {
    expect(bookingFormSchema.safeParse({ ...validForm, privacyAccepted: 'true' }).success).toBe(false);
  });

  it('имя: граница 2 символа проходит, 1 — нет', () => {
    expect(bookingFormSchema.safeParse({ ...validForm, name: 'Ян' }).success).toBe(true);
    expect(issuesOf(bookingFormSchema.safeParse({ ...validForm, name: 'Я' }))).toEqual(['name']);
  });

  it('имя: ровно nameMax проходит, nameMax + 1 — нет', () => {
    expect(bookingFormSchema.safeParse({ ...validForm, name: 'а'.repeat(LIMITS.nameMax) }).success).toBe(true);
    expect(bookingFormSchema.safeParse({ ...validForm, name: 'а'.repeat(LIMITS.nameMax + 1) }).success).toBe(false);
  });

  it('имя из одних пробелов — невалидно', () => {
    expect(issuesOf(bookingFormSchema.safeParse({ ...validForm, name: '     ' }))).toEqual(['name']);
  });

  it.each(['', '123', '+1 (999) 123-45-67', '+7 (099) 123-45-67', 'abcdefghijk', '8'.repeat(LIMITS.phoneMax + 1)])(
    'невалидный телефон %j',
    (phone) => {
      expect(issuesOf(bookingFormSchema.safeParse({ ...validForm, phone }))).toEqual(['phone']);
    },
  );

  it.each(['89991234567', '+79991234567', '9991234567', '+7 999 123 45 67'])('валидный телефон %j', (phone) => {
    expect(bookingFormSchema.safeParse({ ...validForm, phone }).success).toBe(true);
  });

  it('email: пустая строка и отсутствие — ок, мусор — ошибка', () => {
    expect(bookingFormSchema.safeParse({ ...validForm, email: undefined }).success).toBe(true);
    expect(bookingFormSchema.safeParse({ ...validForm, email: 'a@b.ru' }).success).toBe(true);
    expect(issuesOf(bookingFormSchema.safeParse({ ...validForm, email: 'not-an-email' }))).toEqual(['email']);
  });

  it('telegram: @ник и ник без @ — ок, кириллица и короткий — ошибка', () => {
    expect(bookingFormSchema.safeParse({ ...validForm, telegram: '@anna_k' }).success).toBe(true);
    expect(bookingFormSchema.safeParse({ ...validForm, telegram: 'anna_k' }).success).toBe(true);
    expect(bookingFormSchema.safeParse({ ...validForm, telegram: '@анна' }).success).toBe(false);
    expect(bookingFormSchema.safeParse({ ...validForm, telegram: '@abcd' }).success).toBe(false);
  });

  it('комментарий: ровно commentMax — ок, больше — ошибка', () => {
    expect(bookingFormSchema.safeParse({ ...validForm, comment: 'к'.repeat(LIMITS.commentMax) }).success).toBe(true);
    expect(issuesOf(bookingFormSchema.safeParse({ ...validForm, comment: 'к'.repeat(LIMITS.commentMax + 1) }))).toEqual([
      'comment',
    ]);
  });

  it('не выбран слот — ошибка startsAt с понятным текстом', () => {
    const result = bookingFormSchema.safeParse({ ...validForm, startsAt: '' });
    expect(result.success).toBe(false);
    if (result.success === false) expect(result.error.issues[0]?.message).toBe('Выберите время');
  });

  it('startsAt без смещения пояса и не-ISO — ошибка', () => {
    expect(bookingFormSchema.safeParse({ ...validForm, startsAt: '2026-10-20 10:00' }).success).toBe(false);
    expect(bookingFormSchema.safeParse({ ...validForm, startsAt: '2026-10-20T10:00:00+03:00' }).success).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '20-10-2026', ''])('невалидная дата %j', (date) => {
    expect(issuesOf(bookingFormSchema.safeParse({ ...validForm, date }))).toEqual(['date']);
  });

  it('serviceId не uuid — ошибка', () => {
    expect(issuesOf(bookingFormSchema.safeParse({ ...validForm, serviceId: '42' }))).toEqual(['serviceId']);
  });

  it('пустая форма — все обязательные поля в ошибках', () => {
    const paths = issuesOf(bookingFormSchema.safeParse({}));
    expect(paths).toEqual(expect.arrayContaining(['serviceId', 'date', 'startsAt', 'name', 'phone', 'privacyAccepted']));
  });
});

describe('bookingInput', () => {
  it('принимает форму + адрес сайта', () => {
    expect(bookingInput.safeParse(validInput).success).toBe(true);
  });

  it('prefix/slug: заглавные, спецсимволы и превышение длины — ошибка', () => {
    expect(bookingInput.safeParse({ ...validInput, slug: 'Studio' }).success).toBe(false);
    expect(bookingInput.safeParse({ ...validInput, slug: '../etc' }).success).toBe(false);
    expect(bookingInput.safeParse({ ...validInput, prefix: 'abcde' }).success).toBe(false);
    expect(bookingInput.safeParse({ ...validInput, slug: 'a'.repeat(LIMITS.slugMax + 1) }).success).toBe(false);
  });

  it('без prefix — ошибка', () => {
    const { prefix: _omitted, ...rest } = validInput;
    expect(issuesOf(bookingInput.safeParse(rest))).toEqual(['prefix']);
  });
});

describe('rescheduleInput / cancelInput / slotsQuery', () => {
  it('reschedule: валид и пустой слот', () => {
    expect(rescheduleInput.safeParse({ date: '2026-10-21', startsAt: '2026-10-21T08:00:00Z' }).success).toBe(true);
    expect(rescheduleInput.safeParse({ date: '2026-10-21', startsAt: null }).success).toBe(false);
  });

  it('cancel: токен приводится к нижнему регистру и обрезается', () => {
    expect(cancelInput.parse({ token: `  ${TOKEN.toUpperCase()} ` }).token).toBe(TOKEN);
  });

  it('cancel: не-uuid токен — ошибка', () => {
    expect(cancelInput.safeParse({ token: 'drop table bookings' }).success).toBe(false);
  });

  it('slotsQuery: валид и битая дата', () => {
    const base = { prefix: 'b', slug: 'studio', serviceId: SERVICE_ID, date: '2026-10-20' };
    expect(slotsQuery.safeParse(base).success).toBe(true);
    expect(slotsQuery.safeParse({ ...base, date: '2026-10-32' }).success).toBe(false);
  });
});

describe('ответы API', () => {
  it('bookingCreated / slotsResponse / cancelResponse / rescheduleResponse', () => {
    expect(
      bookingCreated.safeParse({
        ok: true, bookingId: SERVICE_ID, cancelToken: TOKEN, status: 'new', startsAt: '2026-10-20T07:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(slotsResponse.safeParse({ ok: true, slots: ['2026-10-20T07:00:00.000Z'] }).success).toBe(true);
    expect(slotsResponse.safeParse({ ok: true, slots: ['10:00'] }).success).toBe(false);
    expect(cancelResponse.safeParse({ ok: true, status: 'cancelled', already: true }).success).toBe(true);
    expect(rescheduleResponse.safeParse({ ok: true, status: 'confirmed', startsAt: 'x' }).success).toBe(true);
  });

  it('parseApiError: известная ошибка сохраняется, мусор → server', () => {
    expect(parseApiError({ ok: false, reason: 'slot_taken' }).reason).toBe('slot_taken');
    expect(parseApiError({ ok: false, reason: 'too_late', phone: '+79991234567' }).phone).toBe('+79991234567');
    expect(parseApiError('<html>502</html>').reason).toBe('server');
    expect(parseApiError({ ok: false, reason: 'unknown_reason' }).reason).toBe('server');
    expect(parseApiError(null).reason).toBe('server');
  });

  it('reasonMessage: too_late с телефоном дополняется номером', () => {
    expect(reasonMessage({ reason: 'too_late', phone: '+7 999 123-45-67' })).toContain('+7 999 123-45-67');
    expect(reasonMessage({ reason: 'too_late' })).toBe(REASON_MESSAGES.too_late);
    expect(reasonMessage({ reason: 'rate_limited' })).toContain('10 минут');
  });

  it('у каждой причины есть сообщение на русском', () => {
    for (const reason of API_REASONS) expect(REASON_MESSAGES[reason].length).toBeGreaterThan(0);
  });
});

describe('firstErrorField', () => {
  it('возвращает первое поле в порядке формы', () => {
    expect(firstErrorField({ phone: ['x'], name: ['y'] })).toBe('name');
    expect(firstErrorField({ privacyAccepted: ['x'] })).toBe('privacyAccepted');
  });

  it('нет известных полей — undefined', () => {
    expect(firstErrorField({})).toBeUndefined();
    expect(firstErrorField(undefined)).toBeUndefined();
    expect(firstErrorField({ prefix: ['x'] })).toBeUndefined();
  });
});
