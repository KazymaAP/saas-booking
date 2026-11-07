// lib/license-client.ts — клиентская часть лицензии (ТЗ 4.0 §14.6, §14.7). Попадает в код, переданный клиенту.
// Работает в Edge Runtime (middleware) и в Node: только Web Crypto (globalThis.crypto.subtle), без 'crypto' из Node.
//
// Протокол:
//   1. Клиент шлёт POST {license_id, domain, version, nonce, ts} + заголовок X-License-Signature = HMAC(body).
//   2. Сервер отвечает {status, license_id, domain, nonce, issued_at} + X-License-Signature = HMAC(body).
//   3. Клиент проверяет подпись, совпадение nonce/license_id/domain. Не совпало → ответ считается сбоем.
//   4. Сбой (сеть, 5xx, подпись) → offline grace: последний подтверждённый статус живёт 7 дней, потом 'unknown'.
//   5. Сбой НИКОГДА не даёт 'blocked' (fail-safe). Блокировка — только подписанный ответ сервера.
// Результат кэшируется в cookie license_status: "status|checked_at|last_ok_at|ok_status|sig".
// Первые два поля совместимы со старым форматом "status|ISO" (middleware читает split('|')[0..1]).
// В cookie лежит только подпись (HMAC от полей), сам секрет в cookie не попадает.

export type LicenseStatus = 'active' | 'unverified' | 'unknown' | 'blocked';
export const LICENSE_STATUSES: readonly LicenseStatus[] = ['active', 'unverified', 'unknown', 'blocked'];

// Откуда взят статус: свежий ответ сервера, offline grace или истёкший grace.
export type LicenseSource = 'server' | 'grace' | 'expired' | 'cache';

export const LICENSE_COOKIE = 'license_status';
export const SIGNATURE_HEADER = 'X-License-Signature';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const PING_INTERVAL_MS = DAY_MS; // §14.6: ping раз в сутки
export const RETRY_INTERVAL_MS = HOUR_MS; // после сбоя пробуем снова через час, а не через сутки
export const OFFLINE_GRACE_MS = 7 * DAY_MS; // §14.6: offline grace 7 дней (антипаттерн — больше 30)
export const PING_TIMEOUT_MS = 5_000; // требование «Ping ≤ 5 сек»
export const COOKIE_MAX_AGE_S = Math.round(OFFLINE_GRACE_MS / 1000); // cookie живёт весь grace-период

export type LicenseConfig = { license_id: string; server_url: string; secret: string };

export type LicenseState = {
  status: LicenseStatus;
  checked_at: string; // когда последний раз пытались проверить (ISO)
  last_ok_at: string | null; // когда последний раз получили подписанный ответ (ISO)
  ok_status: LicenseStatus | null; // статус из последнего подписанного ответа
  source: LicenseSource;
};

export type PingOutcome =
  | { ok: true; status: LicenseStatus }
  | { ok: false; reason: 'config' | 'network' | 'http' | 'signature' | 'payload' };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

// ---------- HMAC (общая часть для клиента и сервера) ----------

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function importKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

// HMAC-SHA256(data, secret) в hex.
export async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await importKey(secret);
  return toHex(await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

// Сравнение за постоянное время: не выдаёт позицию первого несовпадения через тайминг.
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacVerify(secret: string, data: string, signature: string | null): Promise<boolean> {
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return safeEqualHex(await hmacSign(secret, data), signature);
}

// ---------- Конфигурация ----------

type EnvLike = Record<string, string | undefined>;

export function readLicenseConfig(env: EnvLike = process.env): LicenseConfig | null {
  const license_id = env.LICENSE_ID?.trim();
  const server_url = env.LICENSE_SERVER_URL?.trim().replace(/\/+$/, '');
  const secret = env.LICENSE_HMAC_SECRET?.trim();
  if (!license_id || !server_url || !secret) return null;
  return { license_id, server_url, secret };
}

// Сравнение через some(): без приведения readonly-кортежа к string[].
export function isLicenseStatus(v: unknown): v is LicenseStatus {
  return typeof v === 'string' && LICENSE_STATUSES.some((s) => s === v);
}

export function normalizeDomain(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

function newNonce(): string {
  return globalThis.crypto.randomUUID();
}

// ---------- Ping ----------

type ServerReply = { status: LicenseStatus; license_id: string; domain: string; nonce: string };

function parseReply(text: string): ServerReply | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null; // не JSON — считаем ответ недействительным
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r: Record<string, unknown> = { ...raw };
  if (!isLicenseStatus(r.status)) return null;
  if (typeof r.license_id !== 'string' || typeof r.domain !== 'string' || typeof r.nonce !== 'string') return null;
  return { status: r.status, license_id: r.license_id, domain: r.domain, nonce: r.nonce };
}

// Один ping на сервер лицензий. Никогда не бросает исключение.
export async function sendPing(
  cfg: LicenseConfig,
  domain: string,
  version: string,
  fetchImpl: FetchLike = fetch,
): Promise<PingOutcome> {
  const nonce = newNonce();
  const host = normalizeDomain(domain);
  const body = JSON.stringify({ license_id: cfg.license_id, domain: host, version, nonce, ts: new Date().toISOString() });
  let res: Response;
  let text: string;
  try {
    res = await fetchImpl(`${cfg.server_url}/api/license/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SIGNATURE_HEADER]: await hmacSign(cfg.secret, body) },
      body,
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      cache: 'no-store',
    });
    text = await res.text();
  } catch {
    return { ok: false, reason: 'network' }; // таймаут, DNS, обрыв — это сбой, а не блокировка
  }
  // Любой не-2xx — сбой, даже подписанный: 401 (часы клиента сбиты, ключ не подошёл) или 429 не должны
  // перезаписывать подтверждённый статус. Клиент остаётся в offline grace и повторит через час.
  if (!res.ok) return { ok: false, reason: 'http' };
  if (!(await hmacVerify(cfg.secret, text, res.headers.get(SIGNATURE_HEADER)))) return { ok: false, reason: 'signature' };
  const reply = parseReply(text);
  // nonce защищает от повтора старого подписанного ответа, license_id/domain — от подстановки чужого.
  if (!reply || reply.nonce !== nonce || reply.license_id !== cfg.license_id || reply.domain !== host) {
    return { ok: false, reason: 'payload' };
  }
  return { ok: true, status: reply.status };
}

// Совместимость со старым вызовом из middleware: только статус, сбой → 'unknown'.
export async function pingLicense(domain: string, version: string): Promise<LicenseStatus> {
  const cfg = readLicenseConfig();
  if (!cfg) return 'unknown';
  const out = await sendPing(cfg, domain, version);
  return out.ok ? out.status : 'unknown';
}

// ---------- Offline grace ----------

// Статус после неудачного ping. Блокировку из прошлого не переносим: сбой не блокирует сайт.
export function resolveAfterFailure(prev: LicenseState | null, now: Date): LicenseState {
  const nowIso = now.toISOString();
  const lastOk = prev?.last_ok_at ? Date.parse(prev.last_ok_at) : Number.NaN;
  const okStatus = prev?.ok_status ?? null;
  const inGrace = Number.isFinite(lastOk) && now.getTime() - lastOk <= OFFLINE_GRACE_MS && lastOk <= now.getTime();
  if (inGrace && okStatus && okStatus !== 'blocked') {
    return { status: okStatus, checked_at: nowIso, last_ok_at: prev?.last_ok_at ?? null, ok_status: okStatus, source: 'grace' };
  }
  return { status: 'unknown', checked_at: nowIso, last_ok_at: prev?.last_ok_at ?? null, ok_status: okStatus, source: 'expired' };
}

export function resolveAfterSuccess(status: LicenseStatus, now: Date): LicenseState {
  const nowIso = now.toISOString();
  return { status, checked_at: nowIso, last_ok_at: nowIso, ok_status: status, source: 'server' };
}

// Нужен ли новый ping: нет данных, прошли сутки, или прошлый раз был сбой и прошёл час.
export function pingDue(lastCheckedIso: string | undefined, now: Date = new Date(), lastFailed = false): boolean {
  if (!lastCheckedIso) return true;
  const checked = Date.parse(lastCheckedIso);
  if (!Number.isFinite(checked) || checked > now.getTime()) return true; // мусор или дата из будущего
  const interval = lastFailed ? RETRY_INTERVAL_MS : PING_INTERVAL_MS;
  return now.getTime() - checked >= interval;
}

// ---------- Cookie ----------

function cookiePayload(s: LicenseState): string {
  return [s.status, s.checked_at, s.last_ok_at ?? '', s.ok_status ?? ''].join('|');
}

export async function encodeLicenseCookie(secret: string, s: LicenseState): Promise<string> {
  const payload = cookiePayload(s);
  return `${payload}|${await hmacSign(secret, payload)}`;
}

// Неподписанная или подделанная cookie → null (будет новый ping).
export async function decodeLicenseCookie(secret: string, value: string | undefined): Promise<LicenseState | null> {
  if (!value) return null;
  const parts = value.split('|');
  if (parts.length !== 5) return null;
  const [status, checked_at, last_ok_at, ok_status, sig] = parts as [string, string, string, string, string];
  if (!isLicenseStatus(status) || !Number.isFinite(Date.parse(checked_at))) return null;
  if (!(await hmacVerify(secret, parts.slice(0, 4).join('|'), sig))) return null;
  return {
    status,
    checked_at,
    last_ok_at: last_ok_at || null,
    ok_status: isLicenseStatus(ok_status) ? ok_status : null,
    source: 'cache',
  };
}

// ---------- Полная проверка для middleware/layout ----------

export type LicenseCheck = { state: LicenseState; cookie: string | null };

// cookie === null → обновлять cookie не нужно (взяли из свежего кэша).
export async function checkLicense(opts: {
  domain: string;
  version: string;
  cookie: string | undefined;
  now?: Date;
  config?: LicenseConfig | null;
  fetchImpl?: FetchLike;
}): Promise<LicenseCheck | null> {
  const cfg = opts.config === undefined ? readLicenseConfig() : opts.config;
  if (!cfg) return null; // лицензия не настроена (основной сервис, а не переданная копия)
  const now = opts.now ?? new Date();
  const prev = await decodeLicenseCookie(cfg.secret, opts.cookie);
  const lastFailed = Boolean(prev && prev.checked_at !== prev.last_ok_at);
  if (prev && !pingDue(prev.checked_at, now, lastFailed)) return { state: prev, cookie: null };
  const out = await sendPing(cfg, opts.domain, opts.version, opts.fetchImpl);
  const state = out.ok ? resolveAfterSuccess(out.status, now) : resolveAfterFailure(prev, now);
  return { state, cookie: await encodeLicenseCookie(cfg.secret, state) };
}
