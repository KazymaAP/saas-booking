// lib/audit.ts — единая точка записи в audit_log (ТЗ §4.36, §17.8, промт агента 7).
// Каждое изменение в супер-админке пишется сюда. Персональные данные в payload маскируются:
// email → i***@d***.ru, телефон → +7******67, ключи-секреты (password, token…) → '[скрыто]'.
import { adminClient } from './supabase';

export type AuditPayload = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /([a-z0-9._%+-])[a-z0-9._%+-]*@([a-z0-9])[a-z0-9.-]*\.([a-z]{2,})/gi;
// Телефон: +7/8 и 10 цифр с любыми разделителями. Оставляем последние 2 цифры.
const PHONE_RE = /(?:\+7|\b8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*(\d{2})\b/g;
// Ключи, значения которых не пишутся никогда.
const SECRET_KEYS = /pass(word)?|secret|token|api[_-]?key|authorization|cookie|smtp_pass/i;
// Ключи с ПД клиентов: значение маскируется целиком, даже если это не email/телефон.
const PII_KEYS = /^(client_)?(name_full|fio|full_name|client_name|passport|inn_person|birth(day|_date)?)$/i;

export const MAX_DEPTH = 5;
export const MAX_STRING = 1000;
export const MAX_ARRAY = 50;
export const HIDDEN = '[скрыто]';

// Маскирует email и телефоны внутри строки.
export function maskString(s: string): string {
  return s
    .slice(0, MAX_STRING)
    .replace(EMAIL_RE, (_m, a: string, d: string, tld: string) => `${a}***@${d}***.${tld}`)
    .replace(PHONE_RE, (_m, last: string) => `+7******${last}`);
}

// Рекурсивно копирует значение, маскируя ПД. Глубина и размер ограничены, чтобы журнал не раздувался.
export function maskPii(value: unknown, depth = 0, key = ''): unknown {
  if (key && SECRET_KEYS.test(key)) return HIDDEN;
  if (key && PII_KEYS.test(key) && value !== null && value !== undefined) return HIDDEN;
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return maskString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[глубоко]';
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => maskPii(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskPii(v, depth + 1, k);
    return out;
  }
  return String(value);
}

export function maskPayload(payload: AuditPayload): AuditPayload {
  const masked = maskPii(payload);
  return masked && typeof masked === 'object' && !Array.isArray(masked) ? (masked as AuditPayload) : {};
}

// Строка audit_log, готовая к вставке. Вынесено отдельно для тестов и пакетной записи.
export function buildAuditRow(action: string, entity: string, entityId: string | null, payload: AuditPayload = {}) {
  return {
    user_id: null,
    action: action.slice(0, 100),
    entity: entity.slice(0, 50),
    // Колонка entity_id — uuid: не-UUID значение уронило бы insert, переносим его в payload.
    entity_id: entityId && UUID_RE.test(entityId) ? entityId : null,
    payload: maskPayload(entityId && !UUID_RE.test(entityId) ? { ...payload, ref: entityId } : payload),
  };
}

// Пишет одно событие. Ошибка записи журнала не должна ломать само действие — возвращаем false.
export async function audit(action: string, entity: string, entityId: string | null, payload: AuditPayload = {}): Promise<boolean> {
  try {
    const { error } = await adminClient().from('audit_log').insert(buildAuditRow(action, entity, entityId, payload));
    return !error;
  } catch {
    return false;
  }
}

// Пакетная запись: одно событие на каждый id одним insert (массовые операции, ≤ 1 запроса).
export async function auditMany(action: string, entity: string, entityIds: string[], payload: AuditPayload = {}): Promise<boolean> {
  if (entityIds.length === 0) return true;
  try {
    const rows = entityIds.map((id) => buildAuditRow(action, entity, id, payload));
    const { error } = await adminClient().from('audit_log').insert(rows);
    return !error;
  } catch {
    return false;
  }
}
