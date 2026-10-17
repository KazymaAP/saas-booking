// lib/data-request.ts — запросы субъектов ПД (ТЗ 4.0 §4.42, §15.4; ст. 14, 20, 21 ФЗ-152).
// Чистая логика без БД и node:crypto: схема формы, подписи типов, тексты ответа.
// Импортируется и сервером (actions), и клиентской формой (подписи, лимиты).
import { z } from 'zod';
import { DATA_REQUEST_ANSWER_DAYS } from './legal-versions';

// Типы по ТЗ §4.42 + отзыв согласия (ч. 2 ст. 9) и отказ от писем — частые реальные запросы.
export const DATA_REQUEST_TYPES = ['access', 'correct', 'delete', 'withdraw', 'unsubscribe'] as const;
export type DataRequestType = (typeof DATA_REQUEST_TYPES)[number];

export const DATA_REQUEST_TYPE_LABELS: Readonly<Record<DataRequestType, string>> = {
  access: 'Узнать, какие мои данные обрабатываются',
  correct: 'Исправить неточные данные',
  delete: 'Удалить мои данные',
  withdraw: 'Отозвать согласие на обработку',
  unsubscribe: 'Больше не присылать мне письма',
};

export const DATA_REQUEST_TEXT_MAX = 2_000;
export const DATA_REQUEST_BUSINESS_MAX = 200;
// Лимит ТЗ §7.2: 3 запроса за 24 часа с одного IP.
export const DATA_REQUEST_RATE_LIMIT = 3;
export const DATA_REQUEST_RATE_WINDOW_SECONDS = 86_400;

export type DataRequestField = 'email' | 'type' | 'request_text' | 'business';

export type DataRequestState =
  | { status: 'idle' }
  | { status: 'success'; type: DataRequestType }
  | { status: 'error'; reason: 'validation'; fields: Partial<Record<DataRequestField, string>> }
  | { status: 'error'; reason: 'rate_limited' | 'forbidden' | 'server' };

export const DATA_REQUEST_INITIAL_STATE: DataRequestState = { status: 'idle' };

const FIELD_MESSAGES: Readonly<Record<DataRequestField, string>> = {
  email: 'Укажите email, на который придёт ответ, например ivan@example.ru.',
  type: 'Выберите, что нужно сделать с данными.',
  request_text: `Опишите запрос, не более ${DATA_REQUEST_TEXT_MAX} символов.`,
  business: `Не более ${DATA_REQUEST_BUSINESS_MAX} символов.`,
};

// Управляющие символы (кроме перевода строки и табуляции) вырезаются: текст уходит в Telegram и письмо админу.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (value: string) => value.replace(CONTROL_CHARS, '').trim();

export const DataRequestSchema = z.object({
  email: z.string().transform(clean).pipe(z.string().toLowerCase().email().max(254)),
  type: z.enum(DATA_REQUEST_TYPES),
  // Для «удалить» и «отписаться» описание не обязательно: достаточно email.
  request_text: z.string().transform(clean).pipe(z.string().max(DATA_REQUEST_TEXT_MAX)),
  business: z.string().transform(clean).pipe(z.string().max(DATA_REQUEST_BUSINESS_MAX)),
}).superRefine((value, ctx) => {
  const needs_text = value.type === 'access' || value.type === 'correct';
  if (needs_text && value.request_text.length < 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['request_text'], message: 'required' });
  }
});

export type DataRequestInput = z.infer<typeof DataRequestSchema>;

const field_or_null = (name: string): DataRequestField | null =>
  name === 'email' || name === 'type' || name === 'request_text' || name === 'business' ? name : null;

// FormData → проверенные данные или ошибки по полям (тексты — для aria-describedby).
export function parseDataRequestForm(form: FormData):
  | { ok: true; data: DataRequestInput; honeypot: boolean }
  | { ok: false; fields: Partial<Record<DataRequestField, string>> } {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value : '';
  };
  const parsed = DataRequestSchema.safeParse({
    email: text('email'), type: text('type'), request_text: text('request_text'), business: text('business'),
  });
  if (!parsed.success) {
    const fields: Partial<Record<DataRequestField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = field_or_null(String(issue.path[0] ?? ''));
      if (field && !fields[field]) fields[field] = FIELD_MESSAGES[field];
    }
    return { ok: false, fields };
  }
  // Поле-ловушка для ботов скрыто от людей и скринридеров: заполнено → бот.
  return { ok: true, data: parsed.data, honeypot: text('website').length > 0 };
}

// Текст подтверждения: срок по ФЗ-152 — 10 рабочих дней (ст. 14 ч. 3, ст. 20 ч. 1), его и обещаем.
export function dataRequestSuccessText(type: DataRequestType): string {
  const base = `Запрос принят. Ответим на указанный email в течение ${DATA_REQUEST_ANSWER_DAYS} рабочих дней.`;
  if (type === 'delete' || type === 'withdraw') {
    return `${base} Перед удалением можем попросить подтвердить, что адрес принадлежит вам.`;
  }
  return base;
}
