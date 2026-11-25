// общие/lib/support-contacts.test.ts — контакты поддержки из окружения.
// Проверяем то, что видно клиенту в подвале: битый адрес и плейсхолдер из .env.local
// не должны превращаться в рабочую ссылку.
import { afterEach, describe, expect, it } from 'vitest';
import { supportContacts, supportEmail, supportTelegram } from './support-contacts';

const saved = { email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL, tg: process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM };

afterEach(() => {
  if (saved.email === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  else process.env.NEXT_PUBLIC_SUPPORT_EMAIL = saved.email;
  if (saved.tg === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM;
  else process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM = saved.tg;
});

describe('supportEmail', () => {
  it('возвращает null, если переменная пустая', () => {
    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    expect(supportEmail()).toBeNull();
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = '   ';
    expect(supportEmail()).toBeNull();
  });

  it('отклоняет битый адрес', () => {
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'support@';
    expect(supportEmail()).toBeNull();
  });

  it('не показывает плейсхолдер example.com', () => {
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'support@example.com';
    expect(supportEmail()).toBeNull();
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'legal@example.org';
    expect(supportEmail()).toBeNull();
  });

  it('пропускает настоящий адрес', () => {
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'help@zapishisya.ru';
    expect(supportEmail()).toBe('help@zapishisya.ru');
  });
});

describe('supportTelegram', () => {
  it('снимает ведущую собаку', () => {
    process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM = '@zapishisya_help';
    expect(supportTelegram()).toBe('zapishisya_help');
  });

  it('отклоняет слишком короткий и недопустимые символы', () => {
    process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM = '@abc';
    expect(supportTelegram()).toBeNull();
    process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM = 'help me';
    expect(supportTelegram()).toBeNull();
  });
});

describe('supportContacts', () => {
  it('без настроенных контактов отдаёт пустой список', () => {
    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    delete process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM;
    expect(supportContacts()).toEqual([]);
  });

  it('собирает ссылки mailto и t.me', () => {
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'help@zapishisya.ru';
    process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM = '@zapishisya_help';
    const contacts = supportContacts('Заявка на сайт');
    expect(contacts).toHaveLength(2);
    expect(contacts[0].href).toBe('mailto:help@zapishisya.ru?subject=%D0%97%D0%B0%D1%8F%D0%B2%D0%BA%D0%B0%20%D0%BD%D0%B0%20%D1%81%D0%B0%D0%B9%D1%82');
    expect(contacts[1]).toEqual({ href: 'https://t.me/zapishisya_help', label: 'Telegram @zapishisya_help' });
  });
});
