// _lib/result.ts — единый формат ответа server actions кабинета.
// Клиент по нему решает: показать toast успеха, откатить optimistic-состояние или подсветить поля.
import type { ZodError } from 'zod';

export type FieldErrors = Record<string, string>;

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

// Тексты ошибок — по ТЗ §19.5, одинаковые во всех разделах.
export const ERR = {
  network: 'Не удалось. Попробуйте ещё раз',
  forbidden: 'Нет доступа. Войдите заново',
  ownerOnly: 'Доступно только владельцу',
  invalid: 'Проверьте выделенные поля',
  notFound: 'Запись не найдена',
  server: 'Что-то пошло не так',
} as const;

export function ok<T = undefined>(message?: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}

export function fail(error: string, fieldErrors?: FieldErrors): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

// Первая ошибка zod на каждое поле — под полем показываем одну строку.
export function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
