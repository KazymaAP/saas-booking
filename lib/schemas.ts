// lib/schemas.ts — общие zod-схемы flow бронирования (ТЗ §10.3 п.1–2: одна валидация на клиенте и сервере).
// Файл без серверных импортов: его подключают и BookingForm/RescheduleForm (браузер), и route handlers.
import { z } from 'zod';
import { isValidPhone } from './phone';
import { parseDate } from './slots';

// ---------- Ограничения полей ----------
export const LIMITS = {
  nameMin: 2,
  nameMax: 100,
  phoneMax: 20,
  emailMax: 120,
  telegramMax: 33,
  commentMax: 500,
  prefixMax: 4,
  slugMax: 80,
} as const;

// Версия политики конфиденциальности, с которой согласился клиент (bookings.privacy_version).
export const PRIVACY_VERSION = '2026-10-01';

const PHONE_FORMAT_MESSAGE = 'Телефон в формате +7 (999) 123-45-67';
const TELEGRAM_RE = /^@?[A-Za-z0-9_]{5,32}$/;
const SLUG_RE = /^[a-z0-9-]+$/;
const PREFIX_RE = /^[a-z0-9]+$/;

// ---------- Атомы ----------
export const uuidSchema = z.string().uuid('Некорректный идентификатор');
export const tokenSchema = z.string().trim().toLowerCase().uuid('Ссылка недействительна');

export const dateSchema = z
  .string({ required_error: 'Выберите дату', invalid_type_error: 'Выберите дату' })
  .superRefine((value, ctx) => {
    // Одна ошибка на поле: пустое значение и битая дата дают разные, но единственные сообщения.
    if (value.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Выберите дату' });
    else if (parseDate(value) === null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Некорректная дата' });
  });

export const startsAtSchema = z
  .string({ required_error: 'Выберите время', invalid_type_error: 'Выберите время' })
  .min(1, 'Выберите время')
  .datetime({ offset: true, message: 'Выберите время' });

export const nameSchema = z
  .string()
  .trim()
  .min(LIMITS.nameMin, 'Укажите имя (минимум 2 буквы)')
  .max(LIMITS.nameMax, 'Слишком длинное имя');

export const phoneSchema = z
  .string({ required_error: 'Укажите телефон', invalid_type_error: 'Укажите телефон' })
  .trim()
  .superRefine((value, ctx) => {
    // Порядок важен: сначала «пусто», затем длина, затем формат — клиент видит одно сообщение.
    if (value.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Укажите телефон' });
    else if (value.length > LIMITS.phoneMax) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Слишком длинный номер' });
    else if (isValidPhone(value) === false) ctx.addIssue({ code: z.ZodIssueCode.custom, message: PHONE_FORMAT_MESSAGE });
  });

export const emailSchema = z
  .string()
  .trim()
  .max(LIMITS.emailMax, 'Слишком длинный email')
  .email('Некорректный email')
  .or(z.literal(''))
  .optional();

export const telegramSchema = z
  .string()
  .trim()
  .max(LIMITS.telegramMax, 'Слишком длинный ник')
  .regex(TELEGRAM_RE, 'Ник Telegram: латиница, цифры, _ (5–32 символа)')
  .or(z.literal(''))
  .optional();

export const commentSchema = z.string().trim().max(LIMITS.commentMax, 'Комментарий до 500 символов').optional();

// Согласие не предзаполнено (ТЗ §7 публичного сайта); без него запись невозможна (§10.3 п.4).
// Тип — boolean (а не literal true): форма стартует с false без приведения типов, а refine
// одинаково отклоняет false и на клиенте, и на сервере.
const PRIVACY_MESSAGE = 'Нужно согласие на обработку персональных данных';
export const privacySchema = z
  .boolean({ required_error: PRIVACY_MESSAGE, invalid_type_error: PRIVACY_MESSAGE })
  .refine((value) => value === true, { message: PRIVACY_MESSAGE });

export const siteRefSchema = z.object({
  prefix: z.string().trim().min(1).max(LIMITS.prefixMax).regex(PREFIX_RE),
  slug: z.string().trim().min(1).max(LIMITS.slugMax).regex(SLUG_RE),
});

// ---------- Формы и входы API ----------

// Поля формы брони — то, что заполняет клиент (BookingForm + zodResolver).
export const bookingFormSchema = z.object({
  serviceId: uuidSchema,
  date: dateSchema,
  startsAt: startsAtSchema,
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  telegram: telegramSchema,
  comment: commentSchema,
  privacyAccepted: privacySchema,
});
export type BookingFormValues = z.input<typeof bookingFormSchema>;

// Вход POST /api/bookings = поля формы + адрес сайта.
export const bookingInput = bookingFormSchema.merge(siteRefSchema);
export type BookingInput = z.output<typeof bookingInput>;

// Вход POST /api/bookings/{token}/reschedule.
export const rescheduleInput = z.object({ date: dateSchema, startsAt: startsAtSchema });
export type RescheduleInput = z.output<typeof rescheduleInput>;

// Вход POST /api/bookings/{token}/cancel: токен из URL.
export const cancelInput = z.object({ token: tokenSchema });
export type CancelInput = z.output<typeof cancelInput>;

// Query GET /api/bookings/slots.
export const slotsQuery = siteRefSchema.extend({ serviceId: uuidSchema, date: dateSchema });
export type SlotsQuery = z.output<typeof slotsQuery>;

// ---------- Ответы API ----------

export const API_REASONS = [
  'validation', 'rate_limited', 'not_found', 'service_not_found', 'slot_taken', 'too_late',
  'not_cancellable', 'not_reschedulable', 'reschedule_limit', 'forbidden', 'server',
] as const;
export type ApiReason = (typeof API_REASONS)[number];

export const apiError = z.object({
  ok: z.literal(false),
  reason: z.enum(API_REASONS),
  field: z.string().optional(),
  fields: z.record(z.array(z.string())).optional(),
  phone: z.string().nullable().optional(),
  retryAfter: z.number().int().optional(),
});
export type ApiError = z.infer<typeof apiError>;

export const bookingStatusSchema = z.enum(['new', 'confirmed', 'cancelled', 'done', 'completed', 'no_show']);

export const bookingCreated = z.object({
  ok: z.literal(true),
  bookingId: uuidSchema,
  cancelToken: uuidSchema,
  status: bookingStatusSchema,
  startsAt: z.string(),
});
export type BookingCreated = z.infer<typeof bookingCreated>;

export const slotsResponse = z.object({ ok: z.literal(true), slots: z.array(z.string().datetime()) });
export type SlotsResponse = z.infer<typeof slotsResponse>;

export const cancelResponse = z.object({ ok: z.literal(true), status: z.literal('cancelled'), already: z.boolean().optional() });
export type CancelResponse = z.infer<typeof cancelResponse>;

export const rescheduleResponse = z.object({
  ok: z.literal(true),
  status: bookingStatusSchema,
  startsAt: z.string(),
  already: z.boolean().optional(),
});
export type RescheduleResponse = z.infer<typeof rescheduleResponse>;

// ---------- Сообщения для клиента (ТЗ §19.5) ----------
export const REASON_MESSAGES: Record<ApiReason, string> = {
  validation: 'Проверьте заполненные поля.',
  rate_limited: 'Слишком много попыток. Попробуйте через 10 минут.',
  not_found: 'Запись или страница не найдена.',
  service_not_found: 'Услуга недоступна. Выберите другую.',
  slot_taken: 'Это время только что заняли. Выберите другое.',
  too_late: 'Онлайн это уже недоступно. Позвоните, пожалуйста.',
  not_cancellable: 'Эту запись нельзя отменить онлайн.',
  not_reschedulable: 'Эту запись нельзя перенести онлайн.',
  reschedule_limit: 'Запись уже переносили максимальное число раз. Позвоните, пожалуйста.',
  forbidden: 'Запрос отклонён. Обновите страницу и попробуйте снова.',
  server: 'Что-то пошло не так. Попробуйте ещё раз.',
};
export const NETWORK_MESSAGE = 'Не удалось. Попробуйте ещё раз.';

// Разбор ответа API: известная ошибка → её reason, иначе 'server'.
export function parseApiError(body: unknown): ApiError {
  const parsed = apiError.safeParse(body);
  return parsed.success ? parsed.data : { ok: false, reason: 'server' };
}

// Порядок полей формы сверху вниз — для фокуса на первое невалидное поле (ТЗ §19.6).
export const BOOKING_FIELD_ORDER = [
  'serviceId', 'date', 'startsAt', 'name', 'phone', 'email', 'telegram', 'comment', 'privacyAccepted',
] as const satisfies readonly (keyof BookingFormValues)[];
export type BookingField = (typeof BOOKING_FIELD_ORDER)[number];

// Первое по порядку формы поле с ошибкой из ответа сервера ({ fields }).
export function firstErrorField(fields: Record<string, string[]> | undefined): BookingField | undefined {
  if (fields === undefined) return undefined;
  return BOOKING_FIELD_ORDER.find((field) => (fields[field]?.length ?? 0) > 0);
}

// Текст ошибки для клиента; too_late дополняется телефоном бизнеса.
export function reasonMessage(err: Pick<ApiError, 'reason' | 'phone'>): string {
  const base = REASON_MESSAGES[err.reason];
  return err.reason === 'too_late' && err.phone ? `${base} ${err.phone}` : base;
}
