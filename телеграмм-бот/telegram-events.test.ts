// lib/telegram-events.test.ts — Vitest: форматирование уведомлений (HTML, эмодзи, экранирование).
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));

import {
  adminNewBooking,
  BOT_REPLIES,
  cancel,
  clientReply,
  deletionRequest,
  domainsProblem,
  EVENT_EMOJI,
  formatAmount,
  formatWhen,
  generationFailed,
  licenseAlert,
  newBooking,
  payment,
  pluralDays,
  reminder1h,
  reminder24h,
  reschedule,
  restoreTest,
  smtpError,
  subscriptionReminder,
  unconfirmed,
} from './telegram-events';

// 10:30 по Москве (UTC+3)
const AT = '2026-10-20T07:30:00.000Z';
const booking = {
  businessName: 'Студия «Ромашка»',
  serviceName: 'Стрижка',
  scheduledAt: AT,
  clientName: 'Анна',
  clientPhone: '+79990001122',
};

/** Telegram HTML допускает только эти теги; всё прочее — ошибка разбора. */
function onlyAllowedTags(html: string): boolean {
  const tags = html.match(/<\/?([a-z]+)[^>]*>/g) ?? [];
  return tags.every((t) => /^<\/?(b|i|code|a)( href="[^"]*")?>$/.test(t));
}

describe('formatWhen / formatAmount / pluralDays', () => {
  it('время в часовом поясе бизнеса', () => {
    expect(formatWhen(AT)).toBe('20.10.2026, 10:30');
    expect(formatWhen(AT, 'Asia/Yekaterinburg')).toBe('20.10.2026, 12:30');
  });

  it('невалидная дата возвращается как есть', () => {
    expect(formatWhen('не дата')).toBe('не дата');
  });

  it('сумма с разделителем разрядов', () => {
    expect(formatAmount(5000)).toBe('5 000 ₽');
  });

  it('склонение дней', () => {
    expect([1, 2, 5, 11, 21, 22, 25].map(pluralDays)).toEqual(['день', 'дня', 'дней', 'дней', 'день', 'дня', 'дней']);
  });
});

describe('события бизнеса', () => {
  it('новая запись: эмодзи, жирный заголовок, услуга, время, клиент', () => {
    const text = newBooking(booking);
    expect(text.startsWith(`${EVENT_EMOJI.newBooking} <b>Новая запись</b>`)).toBe(true);
    expect(text).toContain('Студия «Ромашка»');
    expect(text).toContain('Стрижка, 20.10.2026, 10:30');
    expect(text).toContain('Клиент: Анна, +79990001122');
    expect(onlyAllowedTags(text)).toBe(true);
  });

  it('экранирует HTML в пользовательских данных', () => {
    const text = newBooking({ ...booking, clientName: '<script>alert(1)</script> & Co' });
    expect(text).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
    expect(text).not.toContain('<script>');
    expect(onlyAllowedTags(text)).toBe(true);
  });

  it('без услуги и клиента — «Услуга», без строки клиента', () => {
    const text = newBooking({ businessName: 'X', scheduledAt: AT });
    expect(text).toContain('Услуга, 20.10.2026, 10:30');
    expect(text).not.toContain('Клиент:');
  });

  it('ссылка на кабинет — тег a с экранированным href', () => {
    const text = newBooking({ ...booking, panelUrl: 'https://x.ru/p?a=1&b=2' });
    expect(text).toContain('<a href="https://x.ru/p?a=1&amp;b=2">Открыть брони</a>');
  });

  it('небезопасная ссылка (javascript:, относительная) пропускается, сообщение без неё', () => {
    expect(newBooking({ ...booking, panelUrl: 'javascript:alert(1)' })).not.toContain('<a ');
    expect(newBooking({ ...booking, panelUrl: '/m/studio/panel' })).not.toContain('<a ');
    expect(newBooking({ ...booking, panelUrl: ' https://x.ru ' })).toContain('<a href="https://x.ru">');
  });

  it('отмена / перенос / напоминания / неподтверждённая', () => {
    expect(cancel(booking)).toMatch(/^❌ <b>Запись отменена клиентом<\/b>/);
    const moved = reschedule({ ...booking, previousAt: '2026-10-19T07:30:00.000Z' });
    expect(moved).toMatch(/^🔄 <b>Запись перенесена<\/b>/);
    expect(moved).toContain('Было: 19.10.2026, 10:30');
    expect(reminder24h(booking)).toMatch(/^⏰ <b>Запись завтра<\/b>/);
    expect(reminder1h(booking)).toMatch(/^⏰ <b>Запись через час<\/b>/);
    expect(unconfirmed(booking)).toMatch(/^⏳ <b>Запись ждёт подтверждения<\/b>/);
  });

  it('подписка: остаток дней и истечение', () => {
    expect(subscriptionReminder({ businessName: 'X', until: '2026-10-23', daysLeft: 3 })).toContain('через 3 дня (23.10.2026)');
    expect(subscriptionReminder({ businessName: 'X', until: '2026-10-20', daysLeft: 0 })).toMatch(/^⛔ <b>Подписка истекла<\/b>/);
  });
});

describe('события владельца сервиса (ТЗ §18.4)', () => {
  it('бронь — формат «🎉 Бронь: business, service, date, client», без телефона', () => {
    expect(adminNewBooking(booking)).toBe('🎉 <b>Бронь</b>: Студия «Ромашка», Стрижка, 20.10.2026, 10:30, Анна');
  });

  it('ответ клиента', () => {
    expect(clientReply({ businessName: 'X', email: 'a@b.ru' })).toBe('📩 <b>Ответ</b>: X, a@b.ru');
  });

  it('лицензия unverified / unknown', () => {
    const unverified = licenseAlert({ kind: 'unverified', licenseId: 'L1', domain: 'evil.ru' });
    expect(unverified).toMatch(/^⚠️ <b>Запуск на другом домене<\/b>/);
    expect(unverified).toContain('<code>evil.ru</code>');
    expect(licenseAlert({ kind: 'unknown', licenseId: 'L1', domain: 'x.ru' })).toMatch(/^🚨 <b>Неизвестный запуск<\/b>/);
  });

  it('оплата, SMTP, генерация, restore test, домены, удаление', () => {
    expect(payment({ businessName: 'X', amount: 5000 })).toBe('💰 <b>Оплата</b>: X, 5 000 ₽');
    expect(smtpError({ account: 'a@y.ru', reason: '535 auth' })).toBe('❌ <b>SMTP error</b>\nЯщик: a@y.ru\nПричина: 535 auth');
    expect(smtpError()).toBe('❌ <b>SMTP error</b>');
    expect(generationFailed({ businessName: 'X' })).toBe('⚠️ <b>Generation failed</b>: X');
    expect(restoreTest({ ok: true })).toBe('🔄 <b>Restore test</b>: успешно');
    expect(restoreTest({ ok: false, details: 'pg_restore exit 1' })).toContain('ошибка\npg_restore exit 1');
    expect(domainsProblem(['a.ru', 'b.ru'])).toBe('⚠️ <b>Домены не проверены</b>: a.ru, b.ru');
    expect(deletionRequest({ businessName: 'X', slug: 'x', purgeAt: '2026-11-14T12:00:00Z' })).toBe('🗑 <b>Запрос на удаление</b>: X (x), очистка 14.11.2026');
  });

  it('длинная причина обрезается до 300 символов', () => {
    const text = smtpError({ reason: 'x'.repeat(1000) });
    expect(text.length).toBeLessThan(350);
  });
});

describe('ответы бизнес-бота (ТЗ §18.3)', () => {
  it('тексты по ТЗ', () => {
    expect(BOT_REPLIES.startWithoutCode).toContain('Отправьте код вида <b>BIZ-xxxxx</b> из админки');
    expect(BOT_REPLIES.unknownCommand).toMatch(/^Неизвестная команда/);
    expect(BOT_REPLIES.codeExpired).toContain('Код истёк');
    expect(BOT_REPLIES.codeUsed).toContain('Код уже использован');
    expect(BOT_REPLIES.codeNotFound).toContain('Код не найден');
  });

  it('connected экранирует имя бизнеса', () => {
    expect(BOT_REPLIES.connected('A<B')).toContain('<b>A&lt;B</b>');
  });
});
