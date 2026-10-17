// lib/auth-forms.test.ts — unit-тесты чистых помощников auth-страниц и ролей (раунд 3 цикла улучшения):
// тексты ошибок из URL, область входа по ?next=, сроки в текстах, разделы кабинета для manager.
import { describe, expect, it } from 'vitest';
import * as core from './auth-core';
import * as forms from './auth-forms';
import * as roles from './auth-roles';

describe('auth-core: сроки в текстах', () => {
  it('ttlText берёт крупнейшую целую единицу и склоняет по-русски', () => {
    expect(core.ttlText(core.MAGIC_LINK_TTL_SECONDS)).toBe('15 минут');
    expect(core.ttlText(core.RESET_TTL_SECONDS)).toBe('1 час');
    expect(core.ttlText(core.INVITE_TTL_SECONDS)).toBe('7 дней');
    expect(core.ttlText(90 * 60)).toBe('90 минут');
    expect(core.ttlText(2 * 3600)).toBe('2 часа');
    expect(core.ttlText(86_400)).toBe('1 день');
    expect(core.ttlText(45)).toBe('45 секунд');
  });

  it('pluralRu: 1, 2–4, 5–20, 21, 11–14', () => {
    const forms3 = ['минуту', 'минуты', 'минут'] as const;
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => core.pluralRu(n, forms3))).toEqual([
      'минуту', 'минуты', 'минуты', 'минут', 'минут', 'минут', 'минут', 'минуту', 'минуты', 'минут', 'минуту', 'минут',
    ]);
  });

  it('тексты уведомлений и ошибок не расходятся с TTL и окном лимита', () => {
    expect(forms.AUTH_NOTICE_TEXT.magic_sent).toContain(core.ttlText(core.MAGIC_LINK_TTL_SECONDS));
    expect(forms.AUTH_NOTICE_TEXT.reset_sent).toContain(core.ttlText(core.RESET_TTL_SECONDS));
    expect(forms.AUTH_ERROR_TEXT.rate_limited).toContain(core.ttlText(core.RATE_LIMITS.login_ip.windowSeconds));
  });
});

describe('auth-core: open redirect через кодирование', () => {
  it('закодированные точки и слэши, сегмент «.» не проходят', () => {
    for (const bad of ['/panel/%2e%2e/api', '/panel/%2E%2E/api', '/panel/.%2e/x', '/panel%2f..%2fapi', '/panel/%5c%5cevil.com', '/panel/./x']) {
      expect(core.sanitizeNext(bad, '/panel')).toBeNull();
    }
    // В query кодирование допустимо: оно не меняет путь.
    expect(core.sanitizeNext('/panel/clients?q=%2e%2e', '/panel')).toBe('/panel/clients?q=%2e%2e');
  });
});

describe('auth-forms: коды из URL и формы', () => {
  it('errorText/noticeText показывают только известные коды', () => {
    expect(forms.errorText('invalid')).toBe(forms.AUTH_ERROR_TEXT.invalid);
    expect(forms.errorText('<script>')).toBeNull();
    expect(forms.errorText('toString')).toBeNull();
    expect(forms.errorText(null)).toBeNull();
    expect(forms.noticeText('logged_out')).toBe(forms.AUTH_NOTICE_TEXT.logged_out);
    expect(forms.noticeText('__proto__')).toBeNull();
  });

  it('formString режет поля по FIELD_MAX и игнорирует файлы', () => {
    const form = new FormData();
    form.set('email', 'a'.repeat(1000));
    form.set('password', new Blob(['x']));
    expect(forms.formString(form, 'email')).toHaveLength(forms.FIELD_MAX.email);
    expect(forms.formString(form, 'password')).toBe('');
    expect(forms.formString(form, 'token')).toBe('');
  });

  it('withQuery пропускает пустые значения и кодирует остальные', () => {
    expect(forms.withQuery('/panel/login', { error: 'invalid', next: null })).toBe('/panel/login?error=invalid');
    expect(forms.withQuery('/panel/login', {})).toBe('/panel/login');
    expect(forms.withQuery('/magic-link', { next: '/s/tire/panel?a=1&b=2' })).toBe('/magic-link?next=%2Fs%2Ftire%2Fpanel%3Fa%3D1%26b%3D2');
  });

  it('realmFromNext: кабинет владельца, супер-админка, мусор', () => {
    expect(forms.realmFromNext('/s/tire/panel/bookings')).toEqual({ realm: 'owner', next: '/s/tire/panel/bookings' });
    expect(forms.realmFromNext('/panel/clients')).toEqual({ realm: 'admin', next: '/panel/clients' });
    expect(forms.realmFromNext('https://evil.com/panel')).toEqual({ realm: 'admin', next: null });
    expect(forms.realmFromNext('/s/tire/panel/%2e%2e/x')).toEqual({ realm: 'admin', next: null });
  });

  it('param берёт первое значение повторённого ключа', () => {
    expect(forms.param({ next: ['/panel/a', '/panel/b'] }, 'next')).toBe('/panel/a');
    expect(forms.param({ next: undefined }, 'next')).toBeNull();
    expect(forms.param({ next: '/panel' }, 'next')).toBe('/panel');
  });
});

describe('auth-roles: разделы кабинета', () => {
  it('manager не видит настройки, подписку и команду; owner видит всё', () => {
    for (const section of roles.OWNER_ONLY_SECTIONS) {
      expect(roles.sectionAllowed('manager', section)).toBe(false);
      expect(roles.sectionAllowed('owner', section)).toBe(true);
    }
    expect(roles.sectionAllowed('manager', 'bookings')).toBe(true);
    expect(roles.sectionAllowed('manager', '')).toBe(true);
  });

  it('sectionOf: раздел из пути кабинета владельца и кастомного домена', () => {
    expect(roles.sectionOf('/s/tire/panel/settings/requisites')).toBe('settings');
    expect(roles.sectionOf('/s/tire/panel')).toBe('');
    expect(roles.sectionOf('/panel/team?x=1')).toBe('team');
    expect(roles.sectionOf('/s/tire')).toBeNull();
    expect(roles.sectionOf(null)).toBeNull();
  });
});
