// lib/rate-limit.ts — атомарный rate limit в Postgres (ТЗ §7; DECISIONS.md: Redis заменён таблицей rate_limits).
// Окно фиксированное: bucket хранит начало окна и число попаданий.
//
// Основной путь — одна SQL-функция (один round-trip, атомарно за счёт INSERT … ON CONFLICT DO UPDATE:
// строка bucket блокируется на время апдейта, конкурентные вызовы выстраиваются в очередь).
// Миграция для зоны 1 (supabase/migrations, см. notes.md «Правки в других зонах»):
//
//   create or replace function rate_limit_hit(p_bucket text, p_limit int, p_window_seconds int)
//   returns table (allowed boolean, hits int, retry_after int)
//   language plpgsql security definer set search_path = public
//   as $$
//   declare
//     v_now timestamptz := clock_timestamp();
//     v_window interval := make_interval(secs => p_window_seconds);
//     v_row rate_limits%rowtype;
//   begin
//     insert into rate_limits as rl (bucket, window_start, hits)
//     values (p_bucket, v_now, 1)
//     on conflict (bucket) do update set
//       window_start = case when rl.window_start <= v_now - v_window then v_now else rl.window_start end,
//       hits         = case when rl.window_start <= v_now - v_window then 1 else rl.hits + 1 end
//     returning * into v_row;
//     return query select
//       v_row.hits <= p_limit,
//       v_row.hits,
//       greatest(0, ceil(extract(epoch from (v_row.window_start + v_window - v_now))))::int;
//   end;
//   $$;
//   revoke all on function rate_limit_hit(text, int, int) from public, anon, authenticated;
//   grant execute on function rate_limit_hit(text, int, int) to service_role;
//
// Пока функции нет (старая схема), работает запасной путь compare-and-swap: условный UPDATE
// «WHERE hits = прочитанное AND window_start = прочитанное». Если между чтением и записью кто-то успел
// изменить строку — UPDATE не затронет ни одной строки, и попытка повторяется. Превысить лимит нельзя.
//
// Сбой БД → fail open (ТЗ §7.3): запрос проходит, предупреждение пишется в журнал без PII.
import { adminClient } from './supabase';
import { logError } from './log';

const RPC_NAME = 'rate_limit_hit';
const TABLE = 'rate_limits';
const SECOND_MS = 1000;
// Сколько раз повторять compare-and-swap при конкурентной записи. Каждая неудача означает,
// что другой запрос успешно записал попадание, поэтому 10 повторов хватает с большим запасом.
const MAX_CAS_ATTEMPTS = 10;
// Коды «функции нет» у PostgREST/Postgres — признак старой схемы, а не сбоя.
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);
// Postgres unique_violation: параллельный запрос первым создал bucket.
const UNIQUE_VIOLATION = '23505';
const UNKNOWN_IP = 'unknown';
const MAX_IP_LENGTH = 64;

// Лимиты зоны бронирования (ТЗ §7.2; cancel/reschedule — из промта зоны 3 и settings.rate_limits).
export const RATE_LIMITS = {
  booking: { limit: 5, windowSeconds: 600 },
  slots: { limit: 30, windowSeconds: 60 },
  cancel: { limit: 10, windowSeconds: 900 },
  reschedule: { limit: 10, windowSeconds: 900 },
} as const;
export type RateLimitScope = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  allowed: boolean;
  hits: number; // попаданий в текущем окне, включая это
  retryAfter: number; // секунд до конца окна (для заголовка Retry-After)
};

type DbError = { code?: string; message: string } | null;
type RateRow = { bucket: string; window_start: string; hits: number };
type RpcRow = { allowed: boolean; hits: number; retry_after: number };

function isMissingFunction(error: DbError): boolean {
  return error !== null && MISSING_FUNCTION_CODES.has(error.code ?? '');
}

function retryAfterSeconds(windowStartMs: number, windowSeconds: number, nowMs: number): number {
  return Math.max(0, Math.ceil((windowStartMs + windowSeconds * SECOND_MS - nowMs) / SECOND_MS));
}

// Ответ fail open: лимит не применён, но и не «съеден».
function failOpen(windowSeconds: number): RateLimitResult {
  return { allowed: true, hits: 0, retryAfter: windowSeconds };
}

// Основной путь: атомарная SQL-функция. null — функции нет в схеме.
async function hitViaRpc(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitResult | null> {
  const { data, error } = await adminClient().rpc(RPC_NAME, {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (isMissingFunction(error)) return null;
  if (error !== null) throw new Error(`rate_limit_hit: ${error.code ?? ''} ${error.message}`);
  // returns table → PostgREST отдаёт массив из одной строки.
  const row: RpcRow | undefined = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) throw new Error('rate_limit_hit: пустой ответ');
  return { allowed: row.allowed, hits: row.hits, retryAfter: row.retry_after };
}

// Одна попытка compare-and-swap. null — строку изменили конкурентно, нужно повторить.
async function casAttempt(bucket: string, limit: number, windowSeconds: number, nowMs: number): Promise<RateLimitResult | null> {
  const db = adminClient();
  const read = await db.from(TABLE).select('bucket, window_start, hits').eq('bucket', bucket).maybeSingle();
  if (read.error !== null) throw new Error(`rate_limits select: ${read.error.message}`);
  const row: RateRow | null = read.data;
  const nowIso = new Date(nowMs).toISOString();

  if (row === null) {
    const ins = await db.from(TABLE).insert({ bucket, window_start: nowIso, hits: 1 });
    if (ins.error === null) return { allowed: 1 <= limit, hits: 1, retryAfter: windowSeconds };
    if (ins.error.code === UNIQUE_VIOLATION) return null;
    throw new Error(`rate_limits insert: ${ins.error.message}`);
  }

  const windowStartMs = Date.parse(row.window_start);
  const expired = Number.isNaN(windowStartMs) || nowMs - windowStartMs >= windowSeconds * SECOND_MS;
  if (expired === false && row.hits >= limit) {
    // Лимит исчерпан: счётчик не трогаем, гонки нет — отказ одинаков для всех конкурентов.
    return { allowed: false, hits: row.hits, retryAfter: retryAfterSeconds(windowStartMs, windowSeconds, nowMs) };
  }

  const next = expired ? { window_start: nowIso, hits: 1 } : { hits: row.hits + 1 };
  const upd = await db
    .from(TABLE)
    .update(next)
    .eq('bucket', bucket)
    .eq('hits', row.hits)
    .eq('window_start', row.window_start)
    .select('hits');
  if (upd.error !== null) throw new Error(`rate_limits update: ${upd.error.message}`);
  if ((upd.data?.length ?? 0) === 0) return null;

  const startMs = expired ? nowMs : windowStartMs;
  return { allowed: next.hits <= limit, hits: next.hits, retryAfter: retryAfterSeconds(startMs, windowSeconds, nowMs) };
}

// Запасной путь без SQL-функции: compare-and-swap с повторами.
async function hitViaCas(bucket: string, limit: number, windowSeconds: number, nowMs: number): Promise<RateLimitResult> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    // Порядок попыток важен: каждая следующая читает свежее состояние после конкурента.
    const result = await casAttempt(bucket, limit, windowSeconds, nowMs);
    if (result !== null) return result;
  }
  // Конкуренция выше разумной — это атака на один bucket: безопаснее отказать.
  return { allowed: false, hits: limit, retryAfter: windowSeconds };
}

export type RateLimitOptions = { nowMs?: number };

// Засчитывает попадание в bucket и сообщает, разрешён ли запрос.
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const nowMs = options.nowMs ?? Date.now();
  try {
    const viaRpc = await hitViaRpc(bucket, limit, windowSeconds);
    if (viaRpc !== null) return viaRpc;
    return await hitViaCas(bucket, limit, windowSeconds, nowMs);
  } catch (error) {
    // ТЗ §7.3: хранилище лимитов недоступно → fail open. В журнал — только scope, без IP.
    const scope = bucket.split(':')[0] ?? 'unknown';
    await logError('booking', 'rate_limit_unavailable', {
      level: 'warn',
      scope,
      error: error instanceof Error ? error.message : String(error),
    });
    return failOpen(windowSeconds);
  }
}

// Лимит по предопределённому scope зоны бронирования: bucket = `${scope}:${ip}`.
export function rateLimitScope(scope: RateLimitScope, ip: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const { limit, windowSeconds } = RATE_LIMITS[scope];
  return rateLimit(`${scope}:${ip}`, limit, windowSeconds, options);
}

// Обратная совместимость со старой сигнатурой: true — запрос разрешён.
export async function hitRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const result = await rateLimit(bucket, limit, windowSeconds);
  return result.allowed;
}

// IP клиента за прокси: первый адрес x-forwarded-for → x-real-ip → 'unknown'.
// Значение обрезается: заголовок задаёт клиент, длинная строка не должна раздувать таблицу.
export function clientIp(headers: Pick<Headers, 'get'>): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real = headers.get('x-real-ip')?.trim();
  const ip = forwarded || real || UNKNOWN_IP;
  return ip.slice(0, MAX_IP_LENGTH);
}
