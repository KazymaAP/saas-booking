// lib/log.ts — журнал ошибок (ТЗ §13.7 «Ошибки»: email, генерация, Vercel, брони, импорт).
// Пишет в audit_log с action = 'error:<source>', вкладка «Ошибки» в /panel/logs фильтрует по префиксу.
// Сообщение обрезается до 500 символов, ПД в сообщении и payload маскируются (ТЗ §17.8).
import { adminClient } from './supabase';
import { maskPayload, maskString, type AuditPayload } from './audit';

export const LOG_SOURCES = ['email', 'generate', 'vercel', 'booking', 'import', 'cron', 'admin', 'export'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export const MAX_MESSAGE = 500;
export const ERROR_PREFIX = 'error:';

// Приводит что угодно (Error, строку, объект) к тексту сообщения.
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

export type ErrorRow = { user_id: null; action: string; entity: LogSource; entity_id: null; payload: AuditPayload & { message: string } };

export function buildErrorRow(source: LogSource, message: string, payload: AuditPayload = {}): ErrorRow {
  // Сначала маскируем, потом режем: иначе обрезка может разорвать email и маска не сработает.
  const text = maskString(message.trim() || 'без сообщения').slice(0, MAX_MESSAGE);
  return {
    user_id: null,
    action: `${ERROR_PREFIX}${source}`,
    entity: source,
    entity_id: null,
    // message идёт после payload, чтобы payload не мог подменить текст ошибки.
    payload: { ...maskPayload(payload), message: text },
  };
}

// Запись ошибки. Никогда не бросает: логирование не должно ломать вызывающий код.
export async function logError(source: LogSource, message: string, payload: AuditPayload = {}): Promise<boolean> {
  try {
    const { error } = await adminClient().from('audit_log').insert(buildErrorRow(source, message, payload));
    return !error;
  } catch {
    return false;
  }
}
