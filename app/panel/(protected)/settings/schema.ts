// app/panel/(protected)/settings/schema.ts — схемы настроек платформы (ТЗ §13.1, §15.5) и чтение их из settings.
// Отдельный модуль: из 'use server' можно экспортировать только async-функции, а схемы нужны странице и тестам.
// Формат значений в settings НЕ меняется — его читают кабинет владельца (platform_requisites), clients и карточка бизнеса
// (tariffs, default_price), публичные API (rate_limits).
import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';

export const SETTINGS_KEYS = ['platform_requisites', 'tariffs', 'default_price', 'rate_limits', 'feature_flags'] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];

const MAX_TEXT = 20_000;
const MAX_PRICE = 1_000_000;
const MAX_LIMIT = 1_000;

const optional = (max: number) => z.string().trim().max(max, `Не длиннее ${max} символов`);

// Проверка номера карты по алгоритму Луна — опечатка в одной цифре не пройдёт.
export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// Карта хранится группами по 4 цифры — так её показывает кабинет владельца.
export function formatCard(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

const card = z
  .string()
  .trim()
  .max(40)
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => !v || /^\d{16,19}$/.test(v), 'Номер карты: 16–19 цифр')
  .refine((v) => !v || luhnValid(v), 'Номер карты с ошибкой — проверьте цифры')
  .transform((v) => (v ? formatCard(v) : ''));

// ИНН самозанятого/ИП — 12 цифр, юрлица — 10.
const inn = z
  .string()
  .trim()
  .refine((v) => !v || /^(\d{10}|\d{12})$/.test(v), 'ИНН: 10 или 12 цифр');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .refine((v) => !v || z.string().email().safeParse(v).success, 'Некорректный email');

const phone = z
  .string()
  .trim()
  .max(40)
  .refine((v) => !v || normalizePhone(v) !== null, 'Телефон РФ: +7 и 10 цифр')
  .transform((v) => (v ? normalizePhone(v) ?? '' : ''));

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !v || /^https:\/\/[^\s]+$/.test(v), 'Ссылка должна начинаться с https://');

export const requisitesSchema = z.object({
  fio: optional(300),
  inn,
  email,
  phone,
  city: optional(100),
  card,
  bank: optional(100),
  nalog_url: httpsUrl,
  oferta: z.string().max(MAX_TEXT, `Не длиннее ${MAX_TEXT} символов`),
  policy: z.string().max(MAX_TEXT, `Не длиннее ${MAX_TEXT} символов`),
});
export type Requisites = z.infer<typeof requisitesSchema>;
export const REQUISITE_FIELDS = Object.keys(requisitesSchema.shape) as (keyof Requisites)[];

// Цена в рублях: целое число, без копеек (подписки и разовая оплата — круглые суммы).
const rub = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label}: введите число` })
    .int(`${label}: целое число рублей`)
    .min(0, `${label}: не меньше 0`)
    .max(MAX_PRICE, `${label}: не больше ${MAX_PRICE.toLocaleString('ru-RU')}`);

const limit = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label}: введите число` })
    .int(`${label}: целое число`)
    .min(1, `${label}: не меньше 1`)
    .max(MAX_LIMIT, `${label}: не больше ${MAX_LIMIT}`);

const tariffName = z.string().trim().min(1, 'Укажите название').max(60, 'Не длиннее 60 символов');

export const tariffsSchema = z.object({
  basic: z.object({ name: tariffName, price: rub('Цена') }),
  pro: z.object({ name: tariffName, price: rub('Цена') }),
});
export type Tariffs = z.infer<typeof tariffsSchema>;

export const defaultPriceSchema = z.object({ initial: rub('Разовая оплата'), monthly: rub('Подписка') });
export type DefaultPrice = z.infer<typeof defaultPriceSchema>;

export const rateLimitsSchema = z.object({ booking_per_10min: limit('Броней'), cancel_per_15min: limit('Отмен') });
export type RateLimits = z.infer<typeof rateLimitsSchema>;

export const flagsSchema = z.object({ ai_assistant: z.boolean(), telegram_clients: z.boolean() });
export type Flags = z.infer<typeof flagsSchema>;

// Значения по умолчанию совпадают с seed (миграция 0004_features.sql).
export const DEFAULTS = {
  platform_requisites: { fio: '', inn: '', email: '', phone: '', city: '', card: '', bank: '', nalog_url: '', oferta: '', policy: '' } satisfies Requisites,
  tariffs: { basic: { name: 'Базовый', price: 1000 }, pro: { name: 'Про', price: 2500 } } satisfies Tariffs,
  default_price: { initial: 5000, monthly: 1000 } satisfies DefaultPrice,
  rate_limits: { booking_per_10min: 5, cancel_per_15min: 10 } satisfies RateLimits,
  feature_flags: { ai_assistant: false, telegram_clients: false } satisfies Flags,
};

export type PlatformSettings = {
  platform_requisites: Requisites;
  tariffs: Tariffs;
  default_price: DefaultPrice;
  rate_limits: RateLimits;
  feature_flags: Flags;
};

// Чтение для формы: каждое поле берётся из базы, если оно корректно, иначе — дефолт.
// Битая запись (ручная правка в БД) не ломает страницу и не теряет остальные поля.
function pick<T extends Record<string, unknown>>(raw: unknown, defaults: T): T {
  const src = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const d = defaults[key];
    const v = src[key];
    if (typeof d === 'object' && d !== null) out[key] = pick(v, d as Record<string, unknown>);
    else if (typeof v === typeof d) out[key] = v;
  }
  return out as T;
}

export function readSettings(rows: { key: string; value: unknown }[]): PlatformSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    platform_requisites: pick(map.get('platform_requisites'), DEFAULTS.platform_requisites),
    tariffs: pick(map.get('tariffs'), DEFAULTS.tariffs),
    default_price: pick(map.get('default_price'), DEFAULTS.default_price),
    rate_limits: pick(map.get('rate_limits'), DEFAULTS.rate_limits),
    feature_flags: pick(map.get('feature_flags'), DEFAULTS.feature_flags),
  };
}

// Плоский список «путь → значение» для сравнения старого и нового (tariffs.basic.price и т. п.).
function flatten(v: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    for (const [k, inner] of Object.entries(v)) {
      for (const [p, val] of flatten(inner, prefix ? `${prefix}.${k}` : k)) out.set(p, val);
    }
  } else if (prefix) {
    out.set(prefix, JSON.stringify(v ?? null));
  }
  return out;
}

// Какие поля изменились — для audit (имена полей без значений) и чтобы не писать одинаковое значение повторно.
export function changedPaths(before: unknown, after: unknown): string[] {
  const a = flatten(before);
  const b = flatten(after);
  return [...b.keys()].filter((k) => a.get(k) !== b.get(k));
}
