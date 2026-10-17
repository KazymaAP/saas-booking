// lib/booking-client.ts — вызовы API брони из браузера (создание, перенос, отмена). Без серверных импортов.
// Ответ всегда разбирается zod-схемой: успех → типизированное тело, иначе ApiError ({ reason, fields, phone }).
// Сетевой сбой → reason 'network' с текстом ТЗ §19.5 «Не удалось. Попробуйте ещё раз».
import type { z } from 'zod';
import {
  bookingCreated,
  cancelResponse,
  parseApiError,
  reasonMessage,
  rescheduleResponse,
  NETWORK_MESSAGE,
  type ApiError,
  type BookingCreated,
  type CancelResponse,
  type RescheduleResponse,
} from './schemas';

export type ClientFailure = (ApiError | { ok: false; reason: 'network'; fields?: undefined; field?: undefined; phone?: undefined; retryAfter?: undefined }) & {
  message: string;
};
export type ClientResult<T> = { ok: true; value: T } | ClientFailure;

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>;

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' } as const;

async function call<T>(fetchImpl: FetchLike, url: string, schema: z.ZodType<T>, body: unknown, signal?: AbortSignal): Promise<ClientResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'POST', headers: { ...JSON_HEADERS }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch {
    // Нет сети / CORS / обрыв — тело недоступно, показываем общий текст про сеть.
    return { ok: false, reason: 'network', message: NETWORK_MESSAGE };
  }
  const json: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (response.ok && parsed.success) return { ok: true, value: parsed.data };
  const error = parseApiError(json);
  return { ...error, message: reasonMessage(error) };
}

// Токен уже провалидирован zod на странице; encodeURIComponent — защита пути от неожиданных символов.
const tokenPath = (token: string, action: 'cancel' | 'reschedule') => `/api/bookings/${encodeURIComponent(token)}/${action}`;

export function createBookingClient(fetchImpl: FetchLike) {
  return {
    create(payload: Record<string, unknown>, signal?: AbortSignal): Promise<ClientResult<BookingCreated>> {
      return call(fetchImpl, '/api/bookings', bookingCreated, payload, signal);
    },
    reschedule(token: string, payload: { date: string; startsAt: string }, signal?: AbortSignal): Promise<ClientResult<RescheduleResponse>> {
      return call(fetchImpl, tokenPath(token, 'reschedule'), rescheduleResponse, payload, signal);
    },
    cancel(token: string, signal?: AbortSignal): Promise<ClientResult<CancelResponse>> {
      return call(fetchImpl, tokenPath(token, 'cancel'), cancelResponse, undefined, signal);
    },
  };
}

export type BookingClient = ReturnType<typeof createBookingClient>;

export function browserBookingClient(): BookingClient {
  return createBookingClient((input, init) => fetch(input, { ...init, credentials: 'same-origin' }));
}
