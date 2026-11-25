// общие/lib/lead.test.ts — валидация заявки с лендинга.
// Проверяем то, что ломается тихо: нормализацию телефона, правило «телефон или email»,
// обязательное согласие и ловушку для ботов.
import { describe, expect, it } from 'vitest';
import { LEAD_MESSAGE_MAX, LEAD_NAME_MAX, maskPhone, normalizePhone, parseLeadForm } from './lead';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = { name: 'Иван', phone: '+7 999 123-45-67', consent: 'on' };

describe('normalizePhone', () => {
  it('приводит привычные записи российского номера к +7', () => {
    expect(normalizePhone('8 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizePhone('+7 999 123 45 67')).toBe('+79991234567');
    expect(normalizePhone('9991234567')).toBe('+79991234567');
    expect(normalizePhone('+7-999-123-45-67')).toBe('+79991234567');
  });

  it('не принимает слишком короткие и слишком длинные номера', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('1234567890123456')).toBeNull();
  });

  it('сохраняет иностранный номер как +<цифры>', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });
});

describe('parseLeadForm', () => {
  it('принимает минимальную заявку: имя, телефон, согласие', () => {
    const result = parseLeadForm(form(valid));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      name: 'Иван',
      phone: '+79991234567',
      email: null,
      message: null,
      source: 'landing',
    });
    expect(result.honeypot).toBe(false);
  });

  it('принимает заявку только с email — телефон не обязателен', () => {
    const result = parseLeadForm(form({ name: 'Анна', email: 'Anna@Example.RU', consent: 'on' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.phone).toBeNull();
    expect(result.data.email).toBe('anna@example.ru');
  });

  it('отклоняет заявку без телефона и email', () => {
    const result = parseLeadForm(form({ name: 'Иван', consent: 'on' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.phone).toBeTruthy();
  });

  it('отклоняет битый телефон и битый email', () => {
    const bad_phone = parseLeadForm(form({ name: 'Иван', phone: '123', consent: 'on' }));
    expect(bad_phone.ok).toBe(false);
    if (!bad_phone.ok) expect(bad_phone.fields.phone).toBeTruthy();

    const bad_email = parseLeadForm(form({ name: 'Иван', email: 'ivan@', consent: 'on' }));
    expect(bad_email.ok).toBe(false);
    if (!bad_email.ok) expect(bad_email.fields.email).toBeTruthy();
  });

  it('требует согласие на обработку данных', () => {
    const result = parseLeadForm(form({ name: 'Иван', phone: '+79991234567' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.consent).toBeTruthy();
  });

  it('считает согласием только on или 1', () => {
    expect(parseLeadForm(form({ ...valid, consent: 'off' })).ok).toBe(false);
    expect(parseLeadForm(form({ ...valid, consent: '1' })).ok).toBe(true);
  });

  it('не принимает пустое и слишком длинное имя', () => {
    expect(parseLeadForm(form({ ...valid, name: '' })).ok).toBe(false);
    expect(parseLeadForm(form({ ...valid, name: 'а'.repeat(LEAD_NAME_MAX + 1) })).ok).toBe(false);
  });

  it('ограничивает длину сообщения и вырезает управляющие символы', () => {
    expect(parseLeadForm(form({ ...valid, message: 'а'.repeat(LEAD_MESSAGE_MAX + 1) })).ok).toBe(false);
    const result = parseLeadForm(form({ ...valid, message: 'Хочу сайт\u0000 для салона\u0007' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toBe('Хочу сайт для салона');
  });

  it('схлопывает пробелы в имени', () => {
    const result = parseLeadForm(form({ ...valid, name: '  Иван   Петров  ' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Иван Петров');
  });

  it('помечает бота по заполненной ловушке, но не ломает разбор', () => {
    const result = parseLeadForm(form({ ...valid, website: 'http://spam.example' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.honeypot).toBe(true);
  });
});

describe('maskPhone', () => {
  it('оставляет узнаваемые края и скрывает середину', () => {
    expect(maskPhone('+79991234567')).toBe('+7 ••• ••• 67');
  });

  it('не падает на пустом номере', () => {
    expect(maskPhone(null)).toBe('не указан');
    expect(maskPhone('+1123')).toBe('•••');
  });
});
