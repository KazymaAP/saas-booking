// lib/cron.ts — авторизация и единая обёртка cron-задач (ТЗ §8.3: все cron — Authorization: Bearer CRON_SECRET).
// В App Router нет app/api/cron/_middleware.ts из ТЗ, поэтому единая точка — requireCron() и runCronJob().
// Модуль не зависит от next/server: ответы строятся через стандартный Response, это упрощает тесты.
import type { SupabaseClient } from '@supabase/supabase-js';

const BEARER_PREFIX = 'Bearer ';
const AUTH_HEADER = 'authorization';
const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVER_ERROR = 500;
// Блокировка живёт чуть дольше лимита функции Vercel Hobby (60 с): если платформа убьёт функцию по таймауту,
// finally не выполнится, и следующий запуск задачи сможет стартовать через 90 с, а не через 5 минут.
const DEFAULT_LOCK_TTL_SECONDS = 90;
const MAX_ERROR_MESSAGE = 300;
// Адреса почты в тексте ошибок (nodemailer пишет «Recipient address rejected: x@y») — PII, в журнал не попадают.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_MASK = '<email>';

// Значение результата задачи: только счётчики, флаги и короткие строки (без PII).
export type CronValue = number | string | boolean | null | string[];
export type CronResult = Record<string, CronValue>;

export interface CronLogger {
  // Ошибка задачи: пишется в журнал ошибок (lib/log.ts → audit_log, action error:cron).
  error(message: string, payload: Record<string, CronValue>): Promise<void>;
  // Итог успешного запуска: пишется в audit_log с action cron:<job>.
  result(job: string, payload: Record<string, CronValue>): Promise<void>;
}

export interface CronNotifier {
  sendMail(opts: { to: string; subject: string; text: string; html?: string }): Promise<boolean>;
  sendTelegram(chatId: string, text: string): Promise<boolean>;
  notifyAdmin(text: string): Promise<boolean>;
}

export interface CronEnv {
  siteUrl: string;
  vercelApiToken: string;
  vercelProjectId: string;
  vercelTeamId: string;
}

export interface CronContext {
  db: SupabaseClient;
  now: Date;
  // Момент (мс, Date.now()), после которого задача должна прекратить брать новые порции работы.
  deadline: number;
  notify: CronNotifier;
  log: CronLogger;
  env: CronEnv;
  fetch: typeof fetch;
}

export type CronHandler = (ctx: CronContext) => Promise<CronResult>;

export interface RunCronOptions {
  lockTtlSeconds?: number;
}

// Сравнение за постоянное время: по времени ответа нельзя подобрать секрет посимвольно.
function safeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Проверяет заголовок Authorization: Bearer <CRON_SECRET>. Пустой или незаданный секрет — всегда отказ.
export function isCronAuthorized(req: Request, secret: string | undefined = process.env.CRON_SECRET): boolean {
  const expected = (secret ?? '').trim();
  if (expected.length === 0) return false;
  const header = req.headers.get(AUTH_HEADER);
  if (header === null || header.startsWith(BEARER_PREFIX) === false) return false;
  return safeEqual(header.slice(BEARER_PREFIX.length), expected);
}

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Единая точка проверки: null — можно работать, иначе готовый ответ 401.
export function requireCron(req: Request, secret?: string): Response | null {
  const authorized = secret === undefined ? isCronAuthorized(req) : isCronAuthorized(req, secret);
  if (authorized) return null;
  return jsonResponse({ ok: false, reason: 'unauthorized' }, HTTP_UNAUTHORIZED);
}

export function redactPii(text: string): string {
  return text.replace(EMAIL_RE, EMAIL_MASK);
}

// Текст ошибки для журнала и ответа: без адресов почты, не длиннее MAX_ERROR_MESSAGE.
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return redactPii(text).slice(0, MAX_ERROR_MESSAGE);
}

// Контекст не создался (нет переменных окружения Supabase и т. п.) — журнала тоже нет, отвечаем 500 с причиной.
function buildContext(makeContext: () => CronContext): CronContext | Response {
  try {
    return makeContext();
  } catch (error) {
    return jsonResponse({ ok: false, reason: 'context', error: errorMessage(error) }, HTTP_SERVER_ERROR);
  }
}

// Блокировка от параллельного запуска одной задачи (pg_net и Vercel могут вызвать задачу повторно).
// Если функции блокировки нет (миграция 0006 не применена) — работаем без неё, но фиксируем ошибку.
async function acquireLock(ctx: CronContext, job: string, runId: string, ttlSeconds: number): Promise<boolean> {
  const { data, error } = await ctx.db.rpc('cron_try_lock', { p_job: job, p_run_id: runId, p_ttl_seconds: ttlSeconds });
  if (error) {
    await ctx.log.error(`cron_try_lock недоступна: ${error.message}`, { job });
    return true;
  }
  return data === true;
}

async function releaseLock(ctx: CronContext, job: string, runId: string): Promise<void> {
  const { error } = await ctx.db.rpc('cron_unlock', { p_job: job, p_run_id: runId });
  if (error) await ctx.log.error(`cron_unlock: ${error.message}`, { job });
}

// Запись журнала не должна менять исход задачи: письма уже ушли, и 500 из-за сбоя журнала заставил бы
// думать, что задача упала. Сбой журнала — только в console.error (его видно в логах Vercel).
async function safeLog(write: () => Promise<void>, job: string): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error(`[cron:${job}] журнал не записан: ${errorMessage(error)}`);
  }
}

// Обёртка любой cron-задачи: авторизация → блокировка → задача → журнал → JSON.
// Ошибка задачи: logError('cron', ...) и 500, чтобы сбой был виден в Vercel и в net._http_response.
export async function runCronJob(
  job: string,
  req: Request,
  handler: CronHandler,
  makeContext: () => CronContext,
  options: RunCronOptions = {},
): Promise<Response> {
  const denied = requireCron(req);
  if (denied !== null) return denied;

  const startedAt = Date.now();
  const ctx = buildContext(makeContext);
  if (ctx instanceof Response) return ctx;
  const runId = crypto.randomUUID();
  const locked = await acquireLock(ctx, job, runId, options.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS);
  if (locked === false) return jsonResponse({ ok: true, job, skipped: 'locked' });

  let result: CronResult;
  try {
    result = await handler(ctx);
  } catch (error) {
    const message = errorMessage(error);
    // run_id связывает запись журнала с ответом (виден в net._http_response и логах Vercel).
    await safeLog(() => ctx.log.error(message, { job, run_id: runId, duration_ms: Date.now() - startedAt }), job);
    await safeLog(() => releaseLock(ctx, job, runId), job);
    return jsonResponse({ ok: false, job, run_id: runId, error: message }, HTTP_SERVER_ERROR);
  }
  await safeLog(() => ctx.log.result(job, { ...result, run_id: runId, duration_ms: Date.now() - startedAt }), job);
  await safeLog(() => releaseLock(ctx, job, runId), job);
  return jsonResponse({ ok: true, job, run_id: runId, result });
}
