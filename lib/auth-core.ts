// lib/auth-core.ts — чистые функции аутентификации (ТЗ 4.0 §5, §7, §17.4).
// Здесь нет обращений к сети, cookies и БД: всё детерминировано и покрыто unit-тестами (lib/auth.test.ts).
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// TTL в секундах (ТЗ §5.1, §5.4–5.6).
export const SESSION_TTL_SECONDS = 30 * DAY;
export const MAGIC_LINK_TTL_SECONDS = 15 * MINUTE;
export const RESET_TTL_SECONDS = HOUR;
export const INVITE_TTL_SECONDS = 7 * DAY;

// Запас до истечения access-токена: страницы кабинета обновляют сессию заранее, чтобы server actions,
// отправленные с уже открытой страницы, не получили просроченный токен.
export const ACCESS_REFRESH_LEEWAY_SECONDS = 5 * MINUTE;

// Пароль: минимум по ТЗ §17 — 8 символов; максимум 72 байта — предел bcrypt в Supabase Auth.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
const EMAIL_MAX_LENGTH = 254;

export type AuthRealm = 'admin' | 'owner';

// Итог попытки входа. 'inactive' сообщается только после верного пароля, чтобы не раскрывать статус бизнеса.
export type SignInResult = 'ok' | 'invalid' | 'rate_limited' | 'forbidden_origin' | 'inactive';

export type RateRule = { readonly limit: number; readonly windowSeconds: number };

// Лимиты ТЗ §7.2. token_verify — решение агента 12 (notes.md): перебор токенов по IP.
export const RATE_LIMITS = {
  login_ip: { limit: 10, windowSeconds: 15 * MINUTE },
  login_email: { limit: 5, windowSeconds: 15 * MINUTE },
  magic_link: { limit: 3, windowSeconds: 15 * MINUTE },
  password_reset: { limit: 3, windowSeconds: 15 * MINUTE },
  invite_accept: { limit: 5, windowSeconds: HOUR },
  token_verify: { limit: 20, windowSeconds: 15 * MINUTE },
} as const satisfies Record<string, RateRule>;

export type RateScope = keyof typeof RATE_LIMITS;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Приводит email к каноническому виду; null, если это не email.
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null;
  return EMAIL_RE.test(email) ? email : null;
}

export type PasswordCheck = 'ok' | 'too_short' | 'too_long';

export function checkPassword(raw: unknown): PasswordCheck {
  if (typeof raw !== 'string' || raw.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (Buffer.byteLength(raw, 'utf8') > PASSWORD_MAX_BYTES) return 'too_long';
  return 'ok';
}

// Одноразовый токен: uuid v4 (ТЗ §5.4–5.6), 122 бита случайности из CSPRNG.
export function generateToken(): string {
  return randomUUID();
}

export function isUuidV4(raw: unknown): raw is string {
  return typeof raw === 'string' && UUID_V4_RE.test(raw);
}

// В БД храним только дайджест токена: утечка таблицы не даёт рабочих ссылок.
// Формат uuid, чтобы дайджест ложился в колонки `token uuid` из ТЗ §4.12 без изменения схемы.
export function tokenDigest(token: string): string {
  const hex = createHash('sha256').update(`auth-token:${token}`, 'utf8').digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Сравнение за постоянное время. Сравниваем хэши, чтобы длины всегда совпадали
// и timingSafeEqual не выдавал длину секрета исключением.
export function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db) && a.length === b.length;
}

// Короткий отпечаток для журналов: позволяет связать события, не раскрывая email/IP (логи без PII).
export function fingerprint(value: string): string {
  return createHash('sha256').update(`auth-log:${value}`, 'utf8').digest('hex').slice(0, 16);
}

type PluralForms = readonly [one: string, few: string, many: string];

const UNIT_FORMS: ReadonlyArray<readonly [seconds: number, forms: PluralForms]> = [
  [DAY, ['день', 'дня', 'дней']],
  [HOUR, ['час', 'часа', 'часов']],
  [MINUTE, ['минуту', 'минуты', 'минут']],
];

const PLURAL_MOD_10 = 10;
const PLURAL_MOD_100 = 100;

// Русское склонение по числу: 1 минуту, 3 минуты, 15 минут, 21 минуту, 11 минут.
export function pluralRu(n: number, forms: PluralForms): string {
  const mod10 = n % PLURAL_MOD_10;
  const mod100 = n % PLURAL_MOD_100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

// Срок для текстов писем и страниц из TTL в секундах: 900 → «15 минут», 3600 → «1 час», 604800 → «7 дней».
// Берётся крупнейшая единица, в которую срок укладывается без остатка: тексты не расходятся с TTL.
export function ttlText(seconds: number): string {
  for (const [unit, forms] of UNIT_FORMS) {
    if (seconds >= unit && seconds % unit === 0) {
      const n = seconds / unit;
      return `${n} ${pluralRu(n, forms)}`;
    }
  }
  return `${seconds} ${pluralRu(seconds, ['секунду', 'секунды', 'секунд'])}`;
}

export function expiresAt(now: Date, ttlSeconds: number): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}

export function isExpired(expiresAtIso: string, now: Date): boolean {
  const ts = Date.parse(expiresAtIso);
  return Number.isNaN(ts) || ts <= now.getTime();
}

// Список супер-админов из SUPERADMIN_EMAILS (через запятую).
export function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => normalizeEmail(s))
    .filter((s): s is string => s !== null);
}

// Проверка членства без раннего выхода: время не зависит от позиции адреса в списке.
export function listIncludesSafe(list: readonly string[], email: string): boolean {
  let found = false;
  for (const item of list) {
    if (safeEqual(item, email)) found = true;
  }
  return found;
}

// Безопасный redirect после входа: только относительный путь внутри разрешённого префикса.
// Отсекает //evil.com, /\evil.com, схемы и управляющие символы (open redirect).
export function sanitizeNext(raw: unknown, allowedPrefix: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  const path = raw.split(/[?#]/)[0] ?? '';
  // Парсер URL браузера понимает %2e как точку: /panel/%2e%2e/api — это выход из префикса.
  // Закодированные слэши (%2f, %5c) в пути панели не нужны и тоже отсекаются.
  if (/%(2e|2f|5c)/i.test(path)) return null;
  if (path.split('/').some((seg) => seg === '..' || seg === '.')) return null;
  const inside = path === allowedPrefix || path.startsWith(`${allowedPrefix}/`);
  return inside ? raw : null;
}

function stripPort(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '');
}

// CSRF (ТЗ §5.9, §17.4): Origin (или Referer, если Origin нет) должен совпадать с Host запроса.
// Host-only сессии (§5.8) означают, что «своим» для запроса является только его же хост.
export function isSameOrigin(origin: string | null, referer: string | null, host: string | null): boolean {
  if (!host) return false;
  const source = origin && origin !== 'null' ? origin : referer;
  if (!source) return false;
  try {
    return new URL(source).host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    return false;
  }
}

// IP клиента для rate limit. Первый адрес X-Forwarded-For задаёт сам клиент — по нему лимит обходится
// подменой заголовка. Поэтому: сначала X-Real-IP (его перезаписывает Vercel / выставляет Caddy),
// затем последний адрес X-Forwarded-For — его добавил ближайший к приложению прокси.
export function parseClientIp(forwardedFor: string | null, realIp: string | null): string {
  const real = realIp?.trim();
  if (real) return real;
  const last = forwardedFor?.split(',').map((s) => s.trim()).filter((s) => s.length > 0).pop();
  return last ?? 'unknown';
}

export function isMainHost(host: string | null, mainHosts: readonly string[]): boolean {
  if (!host) return true;
  const h = stripPort(host);
  const list = mainHosts.map(stripPort);
  return list.includes(h) || h === 'localhost' || h.endsWith('.vercel.app');
}

type JwtPayload = { exp?: unknown };

function isJwtPayload(value: unknown): value is JwtPayload {
  return typeof value === 'object' && value !== null;
}

// Время истечения JWT (секунды Unix) без проверки подписи — только чтобы понять, пора ли обновлять.
// Подлинность токена всё равно проверяет провайдер (lib/auth-provider.ts).
export function jwtExpiry(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (!isJwtPayload(parsed) || typeof parsed.exp !== 'number') return null;
    return parsed.exp;
  } catch {
    return null;
  }
}

export function accessTokenFresh(token: string, now: Date): boolean {
  const exp = jwtExpiry(token);
  if (exp === null) return false;
  return exp - ACCESS_REFRESH_LEEWAY_SECONDS > Math.floor(now.getTime() / 1000);
}

// Состояние одноразового токена (magic-link, reset, invite) по строке из БД.
export type TokenState = 'valid' | 'expired' | 'used' | 'not_found';

export type TokenRowLike = { readonly expiresAt: string; readonly usedAt: string | null };

export function tokenState(row: TokenRowLike | null, now: Date): TokenState {
  if (!row) return 'not_found';
  if (row.usedAt) return 'used';
  return isExpired(row.expiresAt, now) ? 'expired' : 'valid';
}

export type JwtClaims = { readonly sub: string; readonly email: string; readonly exp: number };

function decodeJsonPart(part: string): unknown {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return parsed;
  } catch {
    return null;
  }
}

// Пользовательский токен Supabase: aud и role = 'authenticated'. Ключи anon/service_role подписаны
// тем же секретом — без этой проверки их нельзя отличить от сессии (у них нет sub/email, но полагаться
// только на это — хрупко).
const SUPABASE_USER_AUDIENCE = 'authenticated';

function isUserToken(value: object): boolean {
  const aud: unknown = Reflect.get(value, 'aud');
  const role: unknown = Reflect.get(value, 'role');
  const audOk = aud === undefined || aud === SUPABASE_USER_AUDIENCE
    || (Array.isArray(aud) && aud.includes(SUPABASE_USER_AUDIENCE));
  return audOk && (role === undefined || role === SUPABASE_USER_AUDIENCE);
}

function readClaims(value: unknown): JwtClaims | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!isUserToken(value)) return null;
  const sub: unknown = Reflect.get(value, 'sub');
  const email: unknown = Reflect.get(value, 'email');
  const exp: unknown = Reflect.get(value, 'exp');
  if (typeof sub !== 'string' || typeof email !== 'string' || typeof exp !== 'number') return null;
  return { sub, email: email.toLowerCase(), exp };
}

// Алгоритм подписи из заголовка JWT (без проверки подписи) — чтобы выбрать способ проверки.
export function jwtAlg(token: string): string | null {
  const head = token.split('.')[0];
  if (!head) return null;
  const header = decodeJsonPart(head);
  if (typeof header !== 'object' || header === null) return null;
  const alg: unknown = Reflect.get(header, 'alg');
  return typeof alg === 'string' ? alg : null;
}

// Локальная проверка access-токена Supabase (HS256, SUPABASE_JWT_SECRET) без сетевого запроса:
// проверка сессии укладывается в бюджет ≤ 100 мс. Подпись сравнивается за постоянное время.
export function verifyJwtHs256(token: string, secret: string, now: Date): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) return null;
  const header = decodeJsonPart(headerPart);
  if (typeof header !== 'object' || header === null || Reflect.get(header, 'alg') !== 'HS256') return null;
  const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest('base64url');
  if (!safeEqual(expected, signaturePart)) return null;
  const claims = readClaims(decodeJsonPart(payloadPart));
  if (!claims || claims.exp <= Math.floor(now.getTime() / 1000)) return null;
  return claims;
}

const OWNER_PANEL_RE = /^\/[a-z0-9-]+\/[a-z0-9-]+\/panel(?=\/|$)/i;

// Корень панели, к которой относится путь: '/panel' (супер-админ или кастомный домен)
// либо '/{prefix}/{slug}/panel' (кабинет владельца на основном домене). null — путь не из панели.
export function panelRootOf(path: string): string | null {
  const owner = OWNER_PANEL_RE.exec(path);
  if (owner) return owner[0];
  return path === '/panel' || path.startsWith('/panel/') ? '/panel' : null;
}

// Безопасный путь «вернуться после входа» для любого кабинета: относительный и внутри панели.
export function sanitizePanelNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const root = panelRootOf(raw.split(/[?#]/)[0] ?? '');
  return root ? sanitizeNext(raw, root) : null;
}
