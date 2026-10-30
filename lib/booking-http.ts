// lib/booking-http.ts — общие HTTP-хелперы route handlers зоны бронирования (только сервер).
// Единый формат ошибок { ok: false, reason } (ТЗ §19.5), CSRF-проверка Origin (ТЗ §5.9), rate limit (ТЗ §7).
import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { clientIp, rateLimitScope, type RateLimitScope } from './rate-limit';
import type { ApiError, ApiReason } from './schemas';

// HTTP-статус для каждой причины (дерево решений промта: validation → 400, rate_limited → 429, …).
export const REASON_STATUS: Record<ApiReason, number> = {
  validation: 400,
  rate_limited: 429,
  not_found: 404,
  service_not_found: 400,
  slot_taken: 409,
  too_late: 409,
  not_cancellable: 409,
  not_reschedulable: 409,
  reschedule_limit: 409,
  forbidden: 403,
  server: 500,
  privacy_outdated: 409,
};

const NO_STORE = 'no-store';
const MAX_BODY_BYTES = 16_384; // форма брони — максимум ~1 КБ; больше — мусор или атака

export type Failure = Omit<ApiError, 'ok'>;

export function fail(error: Failure, init: { headers?: Record<string, string> } = {}): NextResponse {
  const body: ApiError = { ok: false, ...error };
  return NextResponse.json(body, {
    status: REASON_STATUS[error.reason],
    headers: { 'Cache-Control': NO_STORE, ...init.headers },
  });
}

export function ok<T extends { ok: true }>(body: T, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { 'Cache-Control': NO_STORE, ...init.headers } });
}

// Ошибки zod → { fields: { name: ['…'] } } для подсветки полей формы.
export function validationFailure(error: ZodError): Failure {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (fields[key] ??= []).push(issue.message);
  }
  const field = Object.keys(fields)[0];
  return { reason: 'validation', field, fields };
}

// Хост запроса за прокси (Vercel/Caddy): x-forwarded-host → host.
function requestHost(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  return (forwarded || req.headers.get('host') || null)?.toLowerCase() ?? null;
}

// CSRF (ТЗ §5.9): Origin браузера должен совпадать с хостом запроса — у кастомных доменов тоже.
// Браузер всегда шлёт Origin в POST из fetch/form; его отсутствие = не браузер (curl, сервер), CSRF невозможен.
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (origin === null) return true;
  const host = requestHost(req);
  if (host === null) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    // Origin: null (sandbox iframe, file://) или мусор — не наш сайт.
    return false;
  }
}

// Rate limit для scope; при отказе — готовый ответ 429 с Retry-After.
export async function limitOrFail(scope: RateLimitScope, req: Request): Promise<NextResponse | null> {
  const result = await rateLimitScope(scope, clientIp(req.headers));
  if (result.allowed) return null;
  return fail({ reason: 'rate_limited', retryAfter: result.retryAfter }, { headers: { 'Retry-After': String(result.retryAfter) } });
}

// Тело запроса как JSON с ограничением размера. null — тело не JSON или слишком большое.
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  const text = await req.text().catch(() => '');
  if (text.length === 0 || text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Невалидный JSON — это ошибка клиента, вызывающий вернёт 400 validation.
    return null;
  }
}
