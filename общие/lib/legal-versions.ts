// lib/legal-versions.ts — версии юридических документов, сроки по ФЗ-152 и ключи cookie-согласия.
// Отдельный модуль без node:crypto и Supabase: его можно импортировать в клиентские компоненты (CookieBanner).
// lib/legal.ts реэкспортирует всё отсюда — единый источник версии для сервера и клиента.

// Версия = дата редакции в формате YYYY-MM-DD. Меняется при любом изменении текста документа.
// PRIVACY_VERSION сохраняется в bookings.privacy_version и cookie_consents.policy_version.
export const PRIVACY_VERSION = '2026-10-15';
export const OFERTA_VERSION = '2026-10-15';
export const DPA_VERSION = '2026-10-15';
export const COOKIE_POLICY_VERSION = PRIVACY_VERSION;

// Сроки ответа на запрос субъекта — рабочие дни: ст. 14 ч. 3, ст. 20 ч. 1–3 ФЗ-152 (ред. 266-ФЗ от 14.07.2022).
export const DATA_REQUEST_ANSWER_DAYS = 10;
export const DATA_REQUEST_EXTENSION_DAYS = 5;

// Срок хранения ПД клиентов бизнеса — 3 года с последней активности (ТЗ §15.4).
export const RETENTION_YEARS = 3;

// Ключ localStorage с выбором посетителя. Значение — JSON StoredCookieConsent.
export const COOKIE_CONSENT_STORAGE_KEY = 'cookie_consent';
// Событие окна: открыть настройки cookie (кнопка «Настройки cookie» в футерах).
export const COOKIE_SETTINGS_EVENT = 'cookie-settings:open';
// Событие окна: выбор изменён (для будущих необязательных скриптов — включать только после него).
export const COOKIE_CHANGE_EVENT = 'cookie-consent:change';
// API записи согласия в cookie_consents.
export const COOKIE_CONSENT_API = '/api/cookie-consent';

export type StoredCookieConsent = {
  version: string;
  analytics: boolean;
  decided_at: string;
};

// Разбор значения из localStorage. Недоверенные данные: любой мусор → null (баннер покажется снова).
export function parseStoredConsent(raw: string | null): StoredCookieConsent | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // Повреждённое значение (ручная правка, другой формат) — считаем, что выбора не было.
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>; // проверено выше: непустой объект
  if (typeof record.version !== 'string' || typeof record.analytics !== 'boolean' || typeof record.decided_at !== 'string') return null;
  return { version: record.version, analytics: record.analytics, decided_at: record.decided_at };
}

// Нужно ли спрашивать снова: выбора нет или он дан к прошлой редакции политики.
export function needsConsent(stored: StoredCookieConsent | null, current_version: string = COOKIE_POLICY_VERSION): boolean {
  return stored === null || stored.version !== current_version;
}
