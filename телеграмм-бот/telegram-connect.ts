// lib/telegram-connect.ts — коды подключения бизнеса к боту: BIZ-xxxxxx (ТЗ §4.30, §18.3).
// Код одноразовый, живёт 15 минут. Захват атомарный: один UPDATE ... WHERE used_at IS NULL
// AND created_at >= now()-15m RETURNING — две одновременные /start с одним кодом не привяжут два чата.
import { randomInt } from 'crypto';
import { adminClient } from '@/lib/supabase';
import { hitRateLimit } from '@/lib/rate-limit';
import { errorName, hashChatId, logTelegramError } from './telegram';

export const CODE_TTL_MINUTES = 15;
export const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
/** Без похожих символов (0/O, 1/I/L): код набирают руками с телефона. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
/** Принимаем и новые коды, и старые hex-коды (BIZ-a1b2c3) — последние истекут по TTL. */
const CODE_PATTERN = /^BIZ-[A-Z0-9]{5,8}$/;
const MISSING_COLUMN = '42703';
/**
 * Попытки ввода кода с одного чата: легальному пользователю хватает 1–2,
 * перебор 31^6 вариантов упирается в лимит задолго до успеха.
 */
export const CODE_ATTEMPTS_LIMIT = 10;
export const CODE_ATTEMPTS_WINDOW_SECONDS = 10 * 60;

export type ClaimResult =
  | { status: 'ok'; businessId: string }
  | { status: 'not_found' }
  | { status: 'used' }
  | { status: 'expired' }
  | { status: 'error' };

export function generateCode(): string {
  let tail = '';
  for (let i = 0; i < CODE_LENGTH; i++) tail += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `BIZ-${tail}`;
}

/** Нормализация ввода: регистр, пробелы, «BIZ xxxx», «biz_xxxx». null — не похоже на код. */
export function normalizeCode(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim().toUpperCase().replace(/^BIZ[\s_]*-?\s*/, 'BIZ-');
  return CODE_PATTERN.test(raw) ? raw : null;
}

export function codeExpiresAt(createdAt: string | Date): Date {
  return new Date(new Date(createdAt).getTime() + CODE_TTL_MS);
}

export function isCodeExpired(createdAt: string | Date, now: Date = new Date(), expiresAt?: string | null): boolean {
  const byCreated = codeExpiresAt(createdAt).getTime();
  const byColumn = expiresAt ? new Date(expiresAt).getTime() : Number.POSITIVE_INFINITY;
  return now.getTime() >= Math.min(byCreated, byColumn);
}

/** Есть ли колонка expires_at (ТЗ §4.30). До миграции агента 1 её нет — проверяем по created_at. */
let hasExpiresColumn = true;

interface CodeRow {
  business_id: string;
  created_at: string;
  used_at: string | null;
  expires_at?: string | null;
}

async function claimAtomically(code: string, now: Date): Promise<{ businessId: string | null; failed: boolean }> {
  const cutoff = new Date(now.getTime() - CODE_TTL_MS).toISOString();
  let query = adminClient()
    .from('business_telegram_codes')
    .update({ used_at: now.toISOString() })
    .eq('code', code)
    .is('used_at', null)
    .gte('created_at', cutoff);
  if (hasExpiresColumn) query = query.gt('expires_at', now.toISOString());
  const { data, error } = await query.select('business_id').maybeSingle();
  if (error?.code === MISSING_COLUMN && hasExpiresColumn) {
    hasExpiresColumn = false;
    return claimAtomically(code, now);
  }
  if (error) {
    await logTelegramError('code_claim_failed', { db_code: error.code ?? null });
    return { businessId: null, failed: true };
  }
  const row: { business_id: string } | null = data;
  return { businessId: row?.business_id ?? null, failed: false };
}

/** Почему не удалось захватить: для понятного ответа пользователю. */
async function explainFailure(code: string, now: Date): Promise<ClaimResult> {
  const columns = hasExpiresColumn ? 'business_id, created_at, used_at, expires_at' : 'business_id, created_at, used_at';
  const { data, error } = await adminClient().from('business_telegram_codes').select(columns).eq('code', code).maybeSingle();
  if (error) {
    await logTelegramError('code_lookup_failed', { db_code: error.code ?? null });
    return { status: 'error' };
  }
  const row = data as CodeRow | null; // select со строкой колонок типизируется как GenericStringError — уточняем
  if (!row) return { status: 'not_found' };
  if (row.used_at) return { status: 'used' };
  if (isCodeExpired(row.created_at, now, row.expires_at)) return { status: 'expired' };
  // Гонка: код захватили между UPDATE и SELECT.
  return { status: 'used' };
}

/** Можно ли этому чату пробовать ещё один код. Сбой хранилища — разрешаем (захват всё равно атомарный). */
export async function allowCodeAttempt(chatId: number | string): Promise<boolean> {
  try {
    return await hitRateLimit(`tg:code:${hashChatId(chatId)}`, CODE_ATTEMPTS_LIMIT, CODE_ATTEMPTS_WINDOW_SECONDS);
  } catch (error: unknown) {
    await logTelegramError('code_attempts_unavailable', { reason: errorName(error) });
    return true;
  }
}

/** Одноразовый захват кода. Код уже нормализован normalizeCode. */
export async function claimCode(code: string, now: Date = new Date()): Promise<ClaimResult> {
  const { businessId, failed } = await claimAtomically(code, now);
  if (failed) return { status: 'error' };
  if (businessId) return { status: 'ok', businessId };
  return explainFailure(code, now);
}

/** Новый код для бизнеса; прежние неиспользованные коды удаляются (активен только последний). */
export async function issueCode(businessId: string): Promise<{ code: string; expiresAt: string } | null> {
  const db = adminClient();
  const { error: cleanupError } = await db.from('business_telegram_codes').delete().eq('business_id', businessId).is('used_at', null);
  if (cleanupError) await logTelegramError('code_cleanup_failed', { db_code: cleanupError.code ?? null });
  const code = generateCode();
  const { data, error } = await db.from('business_telegram_codes').insert({ code, business_id: businessId }).select('created_at').single();
  if (error || !data) {
    await logTelegramError('code_issue_failed', { db_code: error?.code ?? null });
    return null;
  }
  const row: { created_at: string } = data;
  return { code, expiresAt: codeExpiresAt(row.created_at).toISOString() };
}

/** Действующий (не истёкший, не использованный) код бизнеса — для показа на странице. */
export async function activeCode(businessId: string, now: Date = new Date()): Promise<{ code: string; expiresAt: string } | null> {
  const cutoff = new Date(now.getTime() - CODE_TTL_MS).toISOString();
  const { data, error } = await adminClient()
    .from('business_telegram_codes').select('code, created_at')
    .eq('business_id', businessId).is('used_at', null).gte('created_at', cutoff)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    await logTelegramError('code_lookup_failed', { db_code: error.code ?? null });
    return null;
  }
  const row: { code: string; created_at: string } | null = data;
  return row ? { code: row.code, expiresAt: codeExpiresAt(row.created_at).toISOString() } : null;
}

/** Привязка чата к бизнесу. Возвращает имя бизнеса для ответа. */
export async function bindChat(businessId: string, chatId: number | string): Promise<{ name: string } | null> {
  const { data, error } = await adminClient()
    .from('businesses')
    .update({ telegram_chat_id: String(chatId), telegram_connected_at: new Date().toISOString() })
    .eq('id', businessId).select('name').maybeSingle();
  if (error || !data) {
    await logTelegramError('bind_chat_failed', { db_code: error?.code ?? null });
    return null;
  }
  const row: { name: string } = data;
  return row;
}

/** Бизнес по chat_id: нужен, чтобы отличить «свой» чат от постороннего и не отвечать шаблоном. */
export async function businessByChat(chatId: number | string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await adminClient()
    .from('businesses')
    .select('id, name')
    .eq('telegram_chat_id', String(chatId))
    .maybeSingle();
  if (error) return null;
  return (data as { id: string; name: string } | null) ?? null;
}

/** Бот удалён/заблокирован в чате — отвязываем все бизнесы этого чата, чтобы не долбиться в 403. */
export async function unbindChat(chatId: number | string): Promise<number> {
  const { data, error } = await adminClient()
    .from('businesses')
    .update({ telegram_chat_id: null, telegram_connected_at: null })
    .eq('telegram_chat_id', String(chatId)).select('id');
  if (error) {
    await logTelegramError('unbind_chat_failed', { db_code: error.code ?? null });
    return 0;
  }
  return data?.length ?? 0;
}

/** Группа стала супергруппой (migrate_to_chat_id): переносим привязку на новый chat_id. */
export async function rebindChat(oldChatId: number | string, newChatId: number | string): Promise<number> {
  const { data, error } = await adminClient()
    .from('businesses')
    .update({ telegram_chat_id: String(newChatId) })
    .eq('telegram_chat_id', String(oldChatId)).select('id');
  if (error) {
    await logTelegramError('rebind_chat_failed', { db_code: error.code ?? null });
    return 0;
  }
  return data?.length ?? 0;
}

/** Для тестов. */
export function resetConnectState(): void {
  hasExpiresColumn = true;
}
