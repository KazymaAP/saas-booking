// lib/lead.ts — заявка с лендинга («хочу сайт»): схема, нормализация телефона, лимиты, тексты ответа.
// Чистая логика без БД и node:crypto — импортируется и серверным действием, и клиентской формой.
//
// Зачем: до этого все кнопки «Оставить заявку» вели на якорь #partners, где формы не было,
// а финальный блок обещал «напишите нам» без единого контакта. Заявку физически некуда было оставить.
import { z } from 'zod';

export const LEAD_NAME_MAX = 80;
export const LEAD_MESSAGE_MAX = 1_000;
// Как и у запросов субъектов ПД: 3 заявки за 24 часа с одного IP.
export const LEAD_RATE_LIMIT = 3;
export const LEAD_RATE_WINDOW_SECONDS = 86_400;

export const LEAD_SOURCES = ['landing'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export type LeadField = 'name' | 'phone' | 'email' | 'message' | 'consent';

export type LeadState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; reason: 'validation'; fields: Partial<Record<LeadField, string>> }
  | { status: 'error'; reason: 'rate_limited' | 'forbidden' | 'server' };

export const LEAD_INITIAL_STATE: LeadState = { status: 'idle' };

export type LeadInput = {
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  source: LeadSource;
};

const FIELD_MESSAGES: Readonly<Record<LeadField, string>> = {
  name: 'Как к вам обращаться? Достаточно имени, 2–80 символов.',
  phone: 'Проверьте номер: нужно 10–15 цифр, например +7 999 123-45-67.',
  email: 'Проверьте адрес: нужен вид ivan@example.ru.',
  message: `Не более ${LEAD_MESSAGE_MAX} символов.`,
  consent: 'Без согласия на обработку персональных данных мы не можем принять заявку.',
};

// Управляющие символы (кроме перевода строки и табуляции) вырезаются: текст уходит в Telegram и письмо.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (value: string) => value.replace(CONTROL_CHARS, '').trim();
const clean_line = (value: string) => clean(value).replace(/\s+/g, ' ');

/**
 * Телефон в вид +7XXXXXXXXXX (для РФ) или +<цифры>. null — если цифр не 10–15.
 * Восьмёрка в начале 11-значного номера — привычная запись, приводим к +7.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 10) return `+7${digits}`;
  return `+${digits}`;
}

/** Телефон для уведомления: полный номер остаётся только в панели «Лиды». */
export function maskPhone(phone: string | null): string {
  if (!phone) return 'не указан';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '•••';
  // Оставляем код страны и две последние цифры — достаточно, чтобы узнать свой номер, но не позвонить.
  return `${phone.slice(0, 2)} ••• ••• ${phone.slice(-2)}`;
}

export const LeadSchema = z.object({
  name: z.string().transform(clean_line).pipe(z.string().min(2).max(LEAD_NAME_MAX)),
  phone: z.string().transform(clean_line).pipe(z.string().max(40)),
  email: z.string().transform(clean_line).pipe(z.string().max(254)),
  message: z.string().transform(clean).pipe(z.string().max(LEAD_MESSAGE_MAX)),
  consent: z.string().transform(clean).pipe(z.string()),
}).superRefine((value, ctx) => {
  // Достаточно одного канала связи: телефон или email. Оба пустые — просим телефон.
  if (!value.phone && !value.email) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'required' });
    return;
  }
  if (value.phone && normalizePhone(value.phone) === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'invalid' });
  }
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'invalid' });
  }
  // Согласие — отдельное действие (ч. 1 ст. 9 ФЗ-152), галочка по умолчанию не стоит.
  if (value.consent !== 'on' && value.consent !== '1') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['consent'], message: 'required' });
  }
});

const field_or_null = (name: string): LeadField | null =>
  name === 'name' || name === 'phone' || name === 'email' || name === 'message' || name === 'consent' ? name : null;

/** FormData → проверенные данные или ошибки по полям (тексты — для aria-describedby). */
export function parseLeadForm(form: FormData):
  | { ok: true; data: LeadInput; honeypot: boolean }
  | { ok: false; fields: Partial<Record<LeadField, string>> } {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value : '';
  };
  const parsed = LeadSchema.safeParse({
    name: text('name'),
    phone: text('phone'),
    email: text('email'),
    message: text('message'),
    consent: text('consent'),
  });
  if (!parsed.success) {
    const fields: Partial<Record<LeadField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = field_or_null(String(issue.path[0] ?? ''));
      if (field && !fields[field]) fields[field] = FIELD_MESSAGES[field];
    }
    return { ok: false, fields };
  }
  return {
    ok: true,
    honeypot: text('website').length > 0,
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      message: parsed.data.message || null,
      source: 'landing',
    },
  };
}

/** Текст подтверждения: конкретный срок, а не «мы свяжемся». */
export function leadSuccessText(): string {
  return 'Заявка принята. Свяжемся в рабочее время в течение одного рабочего дня.';
}
