// lib/legal.ts — юридический слой (ТЗ 4.0 §15, §9.5, §12.4): версии документов, реквизиты оператора,
// тексты из настроек, хэширование идентификаторов, токены отписки и запись отписок.
// Файл серверный: использует node:crypto и service_role. В клиентские компоненты не импортировать.
import { cache } from 'react';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { adminClient } from './supabase';
import { SITE_URL } from './site';

// ===== Версии документов =====
// Сами константы — в lib/legal-versions.ts (без серверных зависимостей, доступны CookieBanner).
import { DPA_VERSION, OFERTA_VERSION, PRIVACY_VERSION } from './legal-versions';

export {
  COOKIE_CONSENT_STORAGE_KEY, COOKIE_POLICY_VERSION, DPA_VERSION, OFERTA_VERSION, PRIVACY_VERSION,
  needsConsent, parseStoredConsent, type StoredCookieConsent,
} from './legal-versions';

export type LegalDocKey = 'privacy' | 'oferta' | 'dpa';

export type LegalDocMeta = {
  key: LegalDocKey;
  title: string;
  path: string;
  version: string;
  effective_from: string;
};

export const LEGAL_DOCS: Readonly<Record<LegalDocKey, LegalDocMeta>> = {
  privacy: { key: 'privacy', title: 'Политика обработки персональных данных', path: '/privacy', version: PRIVACY_VERSION, effective_from: PRIVACY_VERSION },
  oferta: { key: 'oferta', title: 'Публичная оферта', path: '/oferta', version: OFERTA_VERSION, effective_from: OFERTA_VERSION },
  dpa: { key: 'dpa', title: 'Договор поручения на обработку персональных данных', path: '/dogovor-porucheniya', version: DPA_VERSION, effective_from: DPA_VERSION },
};

// Кэш юридических страниц: 24 часа (статические документы, реквизиты меняются редко).
export const LEGAL_REVALIDATE_SECONDS = 86_400;

// Сроки ответа на запрос субъекта и срок хранения — в lib/legal-versions.ts (нужны и клиентской форме).
export { DATA_REQUEST_ANSWER_DAYS, DATA_REQUEST_EXTENSION_DAYS, RETENTION_YEARS } from './legal-versions';

// Контакты для юридических запросов: env, без хардкода. Используются, если реквизиты в БД не заполнены.
export const LEGAL_EMAIL = (process.env.LEGAL_EMAIL ?? '').trim();
export const LEGAL_ADDRESS = (process.env.LEGAL_ADDRESS ?? '').trim();

export const PLACEHOLDER = 'не указано';

// ===== Форматирование дат =====
// '2026-10-15' → '15 октября 2026 г.' Без часового пояса: дата редакции календарная.
export function formatLegalDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const month_name = months[Number(match[2]) - 1];
  if (!month_name) return iso;
  return `${Number(match[3])} ${month_name} ${match[1]} г.`;
}

// ===== Реквизиты =====
// settings.platform_requisites — jsonb, пишется формой /panel/settings. Данные недоверенные: валидируем zod.
const optional_text = z.string().trim().max(20_000).optional().catch(undefined);

const RequisitesRowSchema = z.object({
  fio: optional_text,
  inn: optional_text,
  email: optional_text,
  phone: optional_text,
  city: optional_text,
  address: optional_text,
  oferta: optional_text,
  policy: optional_text,
  dpa: optional_text,
}).passthrough();

export type Requisites = {
  fio: string | null;
  inn: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  tax_status: string;
  is_complete: boolean;
};

export type LegalTexts = Record<LegalDocKey, string | null>;

type RequisitesBundle = { requisites: Requisites; texts: LegalTexts };

const empty_to_null = (value: string | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

// ИНН физлица — 12 цифр (самозанятый). 10 цифр допускаем на случай перехода на ООО.
export function isValidInn(inn: string | null): boolean {
  return inn !== null && /^(\d{10}|\d{12})$/.test(inn);
}

// Чистая функция: разбирает jsonb из settings и подставляет env-фолбэки. Отдельно от БД — для тестов.
export function parseRequisites(raw: unknown, env: { email: string; address: string } = { email: LEGAL_EMAIL, address: LEGAL_ADDRESS }): RequisitesBundle {
  const parsed = RequisitesRowSchema.safeParse(raw ?? {});
  const row = parsed.success ? parsed.data : {};
  const requisites: Requisites = {
    fio: empty_to_null(row.fio),
    inn: empty_to_null(row.inn),
    email: empty_to_null(row.email) ?? empty_to_null(env.email),
    phone: empty_to_null(row.phone),
    city: empty_to_null(row.city),
    address: empty_to_null(row.address) ?? empty_to_null(env.address),
    tax_status: 'плательщик налога на профессиональный доход (самозанятый)',
    is_complete: false,
  };
  requisites.is_complete = Boolean(requisites.fio && isValidInn(requisites.inn) && requisites.email);
  return {
    requisites,
    texts: { oferta: empty_to_null(row.oferta), privacy: empty_to_null(row.policy), dpa: empty_to_null(row.dpa) },
  };
}

// React cache: один запрос к settings на рендер, даже если реквизиты нужны в нескольких компонентах.
// В тестовой среде (обычный react без cache) используется тождественная обёртка.
const memo: typeof cache = typeof cache === 'function' ? cache : (fn) => fn;

const loadRequisites = memo(async (): Promise<RequisitesBundle> => {
  try {
    const { data, error } = await adminClient().from('settings').select('value').eq('key', 'platform_requisites').maybeSingle();
    if (error) return parseRequisites(null);
    return parseRequisites(data?.value ?? null);
  } catch {
    // Нет доступа к БД (сборка без env, сбой сети): документы показываются с плейсхолдерами, страница не падает.
    return parseRequisites(null);
  }
});

export async function getRequisites(): Promise<Requisites> {
  return (await loadRequisites()).requisites;
}

// Дополнительный текст документа, который владелец ввёл в /panel/settings (поля «Текст оферты», «Текст политики»).
export async function getLegalText(key: LegalDocKey): Promise<string | null> {
  return (await loadRequisites()).texts[key];
}

export type RequisiteLine = { label: string; value: string; missing: boolean };

// Строки для блока «Реквизиты». Номер карты и банк намеренно не публикуются — они только в кабинете.
export function formatRequisites(req: Requisites): RequisiteLine[] {
  const line = (label: string, value: string | null): RequisiteLine => ({ label, value: value ?? PLACEHOLDER, missing: value === null });
  return [
    line('ФИО', req.fio),
    line('Статус', req.tax_status),
    line('ИНН', req.inn),
    line('Город', req.city),
    line('Адрес для корреспонденции', req.address),
    line('Email', req.email),
    line('Телефон', req.phone),
  ];
}

// Короткая подпись оператора для текста документов: «Иванов Иван Иванович (ИНН 123…)».
export function operatorName(req: Requisites): string {
  if (!req.fio) return `Исполнитель (ФИО ${PLACEHOLDER})`;
  return req.inn ? `${req.fio} (ИНН ${req.inn})` : req.fio;
}

// ===== Цены для оферты =====
const PriceSchema = z.object({ name: z.string().optional(), price: z.coerce.number().nonnegative() });
const TariffsSchema = z.object({ basic: PriceSchema, pro: PriceSchema });
const DefaultPriceSchema = z.object({ initial: z.coerce.number().nonnegative(), monthly: z.coerce.number().nonnegative() });

export type Pricing = { setup: number; basic: number; basic_name: string; pro: number; pro_name: string; buyout: number };

// Цены по умолчанию — ТЗ 4.0 §1.3. Используются, только если в settings нет ключей tariffs/default_price.
export const DEFAULT_PRICING: Readonly<Pricing> = { setup: 5000, basic: 1000, basic_name: 'Базовый', pro: 2500, pro_name: 'Премиум', buyout: 5000 };

export function parsePricing(tariffs_raw: unknown, default_raw: unknown): Pricing {
  const tariffs = TariffsSchema.safeParse(tariffs_raw);
  const defaults = DefaultPriceSchema.safeParse(default_raw);
  return {
    setup: defaults.success ? defaults.data.initial : DEFAULT_PRICING.setup,
    basic: tariffs.success ? tariffs.data.basic.price : DEFAULT_PRICING.basic,
    basic_name: (tariffs.success && tariffs.data.basic.name) || DEFAULT_PRICING.basic_name,
    pro: tariffs.success ? tariffs.data.pro.price : DEFAULT_PRICING.pro,
    pro_name: (tariffs.success && tariffs.data.pro.name) || DEFAULT_PRICING.pro_name,
    buyout: DEFAULT_PRICING.buyout,
  };
}

export const getPricing = memo(async (): Promise<Pricing> => {
  try {
    const { data } = await adminClient().from('settings').select('key, value').in('key', ['tariffs', 'default_price']);
    const rows: { key: string; value: unknown }[] = data ?? [];
    const by_key = new Map(rows.map((r) => [r.key, r.value]));
    return parsePricing(by_key.get('tariffs'), by_key.get('default_price'));
  } catch {
    // БД недоступна — оферта показывает цены из ТЗ, чтобы документ оставался полным.
    return { ...DEFAULT_PRICING };
  }
});

export function formatRub(value: number): string {
  return `${value.toLocaleString('ru-RU')} ₽`;
}

// ===== IP и хэширование =====
// Порядок: Cloudflare (ТЗ §0.2: CF перед VPS) → прокси Caddy → первый адрес X-Forwarded-For.
export function getClientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

// SHA-256 с солью (ТЗ §12.3). Без соли не хэшируем: IPv4 перебирается за минуты, хэш без соли = открытые данные.
export function hashIdentifier(value: string, salt: string = process.env.HASH_SALT ?? process.env.ENCRYPTION_KEY ?? ''): string | null {
  if (!salt || !value) return null;
  return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

// ===== CSRF: проверка Origin для POST (ТЗ §5.9, §17.4) =====
export function isTrustedOrigin(origin: string | null, host: string | null, site_url: string = SITE_URL): boolean {
  if (!origin) return false;
  let origin_host: string;
  try {
    origin_host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  if (host) allowed.add(host.toLowerCase());
  try {
    allowed.add(new URL(site_url).host.toLowerCase());
  } catch {
    // Некорректный SITE_URL — доверяем только Host текущего запроса.
  }
  return allowed.has(origin_host);
}

// ===== Email =====
const EmailSchema = z.string().trim().toLowerCase().email().max(254);

export function normalizeEmail(value: string): string | null {
  const parsed = EmailSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// Маска для логов (ТЗ §17.8): «iv***@example.com».
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}


// ===== Отписка от рассылки (ТЗ §9.5, §15.7, RFC 8058) =====
// Токен самодостаточный: email, зашифрованный AES-256-GCM (тег GCM = защита от подделки).
// Почему не uuid-строка в unsubscribes заранее: строка в unsubscribes = факт отписки, а ссылка нужна в каждом письме
// до отписки. Шифрование, а не base64: email не светится в логах прокси и истории браузера.
// В unsubscribes.token пишется детерминированный uuid от email — одинаковый для всех писем одному адресату.
const TOKEN_VERSION = 'u1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_TOKEN_LENGTH = 512;

function unsubscribeKey(secret: string = process.env.UNSUBSCRIBE_SECRET ?? process.env.ENCRYPTION_KEY ?? ''): Buffer | null {
  if (!secret) return null;
  // Отдельный ключ из общего секрета: компрометация токенов не раскрывает ключ SMTP-паролей.
  return createHash('sha256').update(`unsubscribe:${secret}`).digest();
}

export function createUnsubscribeToken(email: string, secret?: string): string | null {
  const key = unsubscribeKey(secret);
  const normalized = normalizeEmail(email);
  if (!key || !normalized) return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_VERSION}.${Buffer.concat([iv, tag, data]).toString('base64url')}`;
}

export function parseUnsubscribeToken(token: string, secret?: string): string | null {
  const key = unsubscribeKey(secret);
  if (!key || token.length > MAX_TOKEN_LENGTH) return null;
  const [version, payload, extra] = token.split('.');
  if (version !== TOKEN_VERSION || !payload || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  const raw = Buffer.from(payload, 'base64url');
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
    return normalizeEmail(plain);
  } catch {
    // Неверный тег GCM: токен подделан или выпущен другим ключом.
    return null;
  }
}

// Детерминированный uuid (формат v4) от email: значение для unsubscribes.token.
export function unsubscribeRowToken(email: string, secret?: string): string | null {
  const key = unsubscribeKey(secret);
  const normalized = normalizeEmail(email);
  if (!key || !normalized) return null;
  const bytes = createHash('sha256').update(key).update(normalized).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildUnsubscribeUrl(email: string, site_url: string = SITE_URL): string | null {
  const token = createUnsubscribeToken(email);
  return token ? `${site_url}/unsubscribe/${token}` : null;
}

// Заголовки RFC 2369 + RFC 8058 для nodemailer (`headers` в sendMail). URL ведёт на One-Click API.
export function buildListUnsubscribeHeaders(email: string, site_url: string = SITE_URL): Record<string, string> | null {
  const token = createUnsubscribeToken(email);
  if (!token) return null;
  return {
    'List-Unsubscribe': `<${site_url}/api/unsubscribe/${token}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export type UnsubscribeResult = { ok: true; already: boolean } | { ok: false; reason: 'invalid_token' | 'server' };

export const UNSUBSCRIBE_REASONS = ['not_interested', 'not_owner', 'too_often', 'other'] as const;
export type UnsubscribeReason = (typeof UNSUBSCRIBE_REASONS)[number];
export type UnsubscribeSource = 'one_click' | 'page' | 'data_request';

export const UNSUBSCRIBE_REASON_LABELS: Readonly<Record<UnsubscribeReason, string>> = {
  not_interested: 'Предложение неинтересно',
  not_owner: 'Я не владелец этого бизнеса или адреса',
  too_often: 'Слишком много писем',
  other: 'Другая причина',
};

export function isUnsubscribeReason(value: string): value is UnsubscribeReason {
  return (UNSUBSCRIBE_REASONS as readonly string[]).includes(value);
}

// Идемпотентная отписка: повторный вызов не создаёт дублей (email UNIQUE) и не меняет дату первой отписки.
// reason при вставке = источник отписки (one_click / page / data_request); причину человек может уточнить позже.
export async function unsubscribeEmail(email: string, source: UnsubscribeSource): Promise<UnsubscribeResult> {
  const token = unsubscribeRowToken(email);
  if (!token) return { ok: false, reason: 'invalid_token' };
  const { error, data } = await adminClient()
    .from('unsubscribes')
    .upsert({ email, token, reason: source }, { onConflict: 'email', ignoreDuplicates: true })
    .select('id');
  if (error) return { ok: false, reason: 'server' };
  return { ok: true, already: (data ?? []).length === 0 };
}

// Уточнение причины после отписки (необязательно для человека). Пишется как «источник:причина».
export async function setUnsubscribeReason(email: string, reason: UnsubscribeReason): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const { error } = await adminClient().from('unsubscribes').update({ reason: `page:${reason}` }).eq('email', normalized);
  return !error;
}

export type UnsubscribeLookup = 'subscribed' | 'unsubscribed' | 'error';

// Точное состояние для страницы отписки: ошибку БД не выдаём за «уже отписаны».
export async function lookupUnsubscribe(email: string): Promise<UnsubscribeLookup> {
  const normalized = normalizeEmail(email);
  if (!normalized) return 'error';
  try {
    const { data, error } = await adminClient().from('unsubscribes').select('id').eq('email', normalized).maybeSingle();
    if (error) return 'error';
    return data === null ? 'subscribed' : 'unsubscribed';
  } catch {
    // Нет соединения с БД.
    return 'error';
  }
}

// Для очереди рассылки (агент 8): true — писать нельзя. Ошибка БД = считаем отписанным (безопасный дефолт по 38-ФЗ).
export async function isUnsubscribed(email: string): Promise<boolean> {
  return (await lookupUnsubscribe(email)) !== 'subscribed';
}

// ===== Журнал ошибок юридического слоя =====
// Пишется в audit_log с action 'error:legal' (формат lib/log.ts; там тип source закрыт, поэтому свой хелпер).
// payload — без PII: вызывающий код передаёт только маски и типы. Сбой записи журнала не бросается.
export async function logLegalError(message: string, payload: Record<string, string | number | boolean | null> = {}): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      user_id: null,
      action: 'error:legal',
      entity: 'legal',
      entity_id: null,
      payload: { message: message.slice(0, 500), ...payload },
    });
  } catch {
    // Журнал недоступен — ошибку уже вернули пользователю статусом, дальше ничего сделать нельзя.
  }
}
