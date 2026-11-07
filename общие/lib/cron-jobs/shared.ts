// lib/cron-jobs/shared.ts — общие помощники cron-хендлеров: время, разбор ответов Supabase, захват ключей, отправка.
import { errorMessage, type CronContext } from '../cron';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
// Тяжёлые задачи берут работу порциями (ТЗ: батчи по 50), остаток — следующий запуск.
export const BATCH_SIZE = 50;
// Даты (subscription_until, support_until, last_reset) в ТЗ — по Москве. Europe/Moscow без перехода на летнее время.
export const MOSCOW_OFFSET_MS = 3 * HOUR_MS;
export const MOSCOW_TZ = 'Europe/Moscow';

type DbResponse = { data: unknown; error: { message: string } | null };

// Клиент Supabase без сгенерированных типов отдаёт data: any. Здесь — единственное место приведения к типам
// из lib/database.types.ts; ошибка запроса всегда превращается в исключение (→ 500 + logError в runCronJob).
export function unwrap<T>(response: DbResponse, what: string): T {
  if (response.error !== null) throw new Error(`${what}: ${response.error.message}`);
  return response.data as T;
}

export function unwrapRows<T>(response: DbResponse, what: string): T[] {
  return unwrap<T[] | null>(response, what) ?? [];
}

export function isoAgo(now: Date, ms: number): string {
  return new Date(now.getTime() - ms).toISOString();
}

export function isoAhead(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString();
}

// Календарная дата по Москве (YYYY-MM-DD) со сдвигом в днях.
export function moscowDate(now: Date, shiftDays = 0): string {
  return new Date(now.getTime() + MOSCOW_OFFSET_MS + shiftDays * DAY_MS).toISOString().slice(0, 10);
}

export function formatMoscow(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { timeZone: MOSCOW_TZ, dateStyle: 'long', timeStyle: 'short' });
}

export function firstEmail(emails: readonly string[] | null | undefined): string | null {
  const value = emails?.find((email) => email.trim().length > 0);
  return value === undefined ? null : value.trim();
}

export function hasTimeLeft(ctx: CronContext): boolean {
  return Date.now() < ctx.deadline;
}

// Захват ключей идемпотентности (public.cron_claim): возвращает только ключи, захваченные этим вызовом.
export async function claimKeys(ctx: CronContext, job: string, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const claimed = unwrapRows<string>(await ctx.db.rpc('cron_claim', { p_job: job, p_keys: keys }), 'cron_claim');
  return new Set(claimed);
}

// Освобождение ключей после неудачной отправки — следующий запуск попробует снова.
export async function releaseKeys(ctx: CronContext, job: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  unwrap(await ctx.db.rpc('cron_release', { p_job: job, p_keys: keys }), 'cron_release');
}

// Обработка захваченных ключей: если work упал исключением (сбой БД посреди задачи), все ключи освобождаются —
// иначе напоминания по ним не ушли бы никогда. Исключение пробрасывается дальше (→ 500 + logError в runCronJob).
export async function withClaimedKeys<T>(ctx: CronContext, job: string, keys: string[], work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    await releaseKeys(ctx, job, keys);
    throw error;
  }
}

export type SendOutcome = 'sent' | 'failed';

// Письмо без исключений наружу: сбой SMTP пишется в журнал (без адреса — это PII) и считается неудачей.
export async function safeSendMail(
  ctx: CronContext,
  job: string,
  mail: { to: string; subject: string; text: string },
): Promise<SendOutcome> {
  try {
    const sent = await ctx.notify.sendMail(mail);
    return sent ? 'sent' : 'failed';
  } catch (error) {
    await ctx.log.error(`sendMail: ${errorText(error)}`, { job });
    return 'failed';
  }
}

// Telegram бизнесу — дополнительный канал: его сбой не отменяет письмо и не повторяется, только журналируется.
export async function safeSendTelegram(ctx: CronContext, job: string, chatId: string | null, text: string): Promise<boolean> {
  if (chatId === null || chatId.length === 0) return false;
  try {
    return await ctx.notify.sendTelegram(chatId, text);
  } catch (error) {
    await ctx.log.error(`sendTelegram: ${errorText(error)}`, { job });
    return false;
  }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  // size < 1 дал бы бесконечный цикл и зависшую до таймаута функцию.
  if (Number.isInteger(size) === false || size < 1) throw new Error(`chunk: недопустимый размер порции ${size}`);
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

// Текст ошибки внешнего вызова для журнала (без адресов почты — lib/cron.ts → errorMessage).
export function errorText(error: unknown): string {
  return errorMessage(error);
}
