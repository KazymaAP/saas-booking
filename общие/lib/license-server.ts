// lib/license-server.ts — серверная часть лицензии (ТЗ 4.0 §14.6, §14.7): приём ping, HMAC, решение по статусу.
// Зависимости (БД, Telegram) передаются через интерфейсы — логика тестируется без Supabase.
//
// Ключи. LICENSE_HMAC_SECRET на сервере — мастер-секрет. Клиенту выдаётся производный ключ
// deriveLicenseKey(master, license_id) = HMAC(master, "license:" + license_id). Поэтому:
//   ▸ мастер-секрет не уходит ни одному клиенту;
//   ▸ клиент A не может подписать ответ «active» для лицензии клиента B.
// Клиент кладёт производный ключ в свой LICENSE_HMAC_SECRET (выдаётся в transfer-файле).
//
// Блокировка — только вручную (licenses.revoked). Автоматически сервер максимум помечает unverified/unknown
// и шлёт алерт владельцу (не чаще раза в сутки на пару лицензия+домен+статус).
import { z } from 'zod';
import { hmacSign, hmacVerify, normalizeDomain, type LicenseStatus } from './license-client';
import { adminClient } from './supabase';
import { notifyAdmin } from './admin-notify';

export const ALERT_DEDUP_MS = 86_400_000; // один алерт в сутки на (лицензия, домен, статус)
// Middleware клиента пингует при первом визите каждого посетителя (cookie у каждого браузера своя), поэтому
// одинаковые ping (лицензия, домен, статус) пишутся в журнал не чаще раза в час — иначе license_pings растёт
// пропорционально посещаемости клиента, а не числу копий.
export const PING_LOG_DEDUP_MS = 3_600_000;
export const PING_RETENTION_DAYS = 183; // ТЗ §4.50: license_pings хранятся 6 месяцев
const MAX_CLOCK_SKEW_MS = 86_400_000; // ts из запроса не дальше суток от серверного времени
export const UNBOUND_DOMAIN = 'не указан'; // так transfer помечает лицензию без домена (привяжется при первом ping)

export type LicenseRow = {
  license_id: string;
  domain: string | null;
  allowed_domains: string[] | null;
  revoked: boolean;
};

export type PingRow = {
  license_id: string | null;
  domain: string;
  version: string;
  ip: string | null;
  user_agent: string | null;
  status: LicenseStatus;
};

export interface LicenseStore {
  findLicense(license_id: string): Promise<LicenseRow | null>;
  recordPing(row: PingRow): Promise<void>;
  // Был ли уже ping с таким статусом после sinceIso — для дедупликации алертов и записей журнала.
  hasRecentSignal(license_id: string | null, domain: string, status: LicenseStatus, sinceIso: string): Promise<boolean>;
  bindDomain(license_id: string, domain: string): Promise<void>;
}

export type Alerter = (text: string) => Promise<void>;

export const PingBody = z.object({
  license_id: z.string().uuid(),
  domain: z.string().trim().min(3).max(253).transform(normalizeDomain),
  version: z.string().trim().max(40).default('unknown'),
  nonce: z.string().min(8).max(64).optional(),
  ts: z.string().datetime().optional(),
});
export type PingInput = z.infer<typeof PingBody>;

export type PingRequest = {
  raw_body: string;
  signature: string | null;
  ip: string | null;
  user_agent: string | null;
  now?: Date;
};

export type PingResponse = {
  http_status: number;
  body: string; // ровно эти байты подписаны
  signature: string | null;
  status: LicenseStatus;
};

// ---------- Ключи ----------

export function deriveLicenseKey(master: string, license_id: string): Promise<string> {
  return hmacSign(master, `license:${license_id.toLowerCase()}`);
}

// ---------- Маскирование для логов и алертов (без PII и полного домена) ----------

export function maskDomain(domain: string): string {
  const parts = normalizeDomain(domain).split('.');
  if (parts.length < 2) return '***';
  const tld = parts.pop() ?? '';
  const name = parts.join('.');
  const masked = name.length <= 2 ? `${name[0] ?? ''}*` : `${name[0]}***${name[name.length - 1]}`;
  return `${masked}.${tld}`;
}

export function maskId(id: string | null): string {
  return id ? `${id.slice(0, 8)}…` : '—';
}

// ---------- Решение по статусу ----------

function domainVariants(d: string): string[] {
  const n = normalizeDomain(d);
  return n.startsWith('www.') ? [n, n.slice(4)] : [n, `www.${n}`];
}

export function isDomainAllowed(lic: LicenseRow, domain: string): boolean {
  const host = normalizeDomain(domain);
  const allowed = [lic.domain ?? '', ...(lic.allowed_domains ?? [])].filter((d) => d && d !== UNBOUND_DOMAIN);
  return allowed.some((d) => domainVariants(d).includes(host));
}

// Лицензия выдана без домена: первый ping сам привязывает домен (§14.6 «allowed_domains обновляется автоматически»).
export function isUnbound(lic: LicenseRow): boolean {
  const main = (lic.domain ?? '').trim();
  return (!main || main === UNBOUND_DOMAIN) && (lic.allowed_domains ?? []).length === 0;
}

// localhost и превью-сборки клиента не считаются нарушением и не привязываются.
export function isDevHost(domain: string): boolean {
  const h = normalizeDomain(domain);
  return h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h.endsWith('.vercel.app');
}

export type Decision = { status: LicenseStatus; bind: boolean };

export function decideStatus(lic: LicenseRow | null, domain: string): Decision {
  if (!lic) return { status: 'unknown', bind: false };
  if (lic.revoked) return { status: 'blocked', bind: false }; // только ручная блокировка
  if (isDomainAllowed(lic, domain)) return { status: 'active', bind: false };
  if (isDevHost(domain)) return { status: 'active', bind: false };
  if (isUnbound(lic)) return { status: 'active', bind: true };
  return { status: 'unverified', bind: false };
}

// ---------- Подпись ответа ----------

export async function signedReply(
  key: string | null,
  http_status: number,
  payload: Record<string, string>,
  status: LicenseStatus,
): Promise<PingResponse> {
  const body = JSON.stringify(payload);
  return { http_status, body, signature: key ? await hmacSign(key, body) : null, status };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null; // невалидный JSON → ответ 400 ниже
  }
}

function skewTooBig(ts: string | undefined, now: Date): boolean {
  if (!ts) return false;
  return Math.abs(now.getTime() - Date.parse(ts)) > MAX_CLOCK_SKEW_MS;
}

async function maybeAlert(store: LicenseStore, alert: Alerter, input: PingInput, licId: string | null, status: LicenseStatus, now: Date) {
  if (status !== 'unverified' && status !== 'unknown') return;
  const since = new Date(now.getTime() - ALERT_DEDUP_MS).toISOString();
  // Проверяем ДО записи текущего ping, иначе он сам себя «задедуплицирует».
  if (await store.hasRecentSignal(licId, input.domain, status, since)) return;
  const icon = status === 'unknown' ? '🚨 Неизвестный запуск' : '⚠️ Запуск на неразрешённом домене';
  await alert(`${icon}: лицензия ${maskId(input.license_id)}, домен ${maskDomain(input.domain)}. Подробности: /panel/licenses`);
}

// ---------- Основной обработчик ----------

export async function handlePing(req: PingRequest, deps: { store: LicenseStore; alert: Alerter; master_secret: string | null }): Promise<PingResponse> {
  const now = req.now ?? new Date();
  const parsed = PingBody.safeParse(parseJson(req.raw_body));
  if (!parsed.success) return signedReply(null, 400, { status: 'unknown', reason: 'validation' }, 'unknown');
  const input = parsed.data;
  const key = deps.master_secret ? await deriveLicenseKey(deps.master_secret, input.license_id) : null;
  const base = { license_id: input.license_id, domain: input.domain, nonce: input.nonce ?? '', issued_at: now.toISOString() };

  // Подписанный клиент (новый протокол): подпись обязана сойтись, иначе запрос не от владельца ключа.
  const signedClient = Boolean(input.nonce);
  if (signedClient && (!key || !(await hmacVerify(key, req.raw_body, req.signature)) || skewTooBig(input.ts, now))) {
    return signedReply(key, 401, { ...base, status: 'unknown', reason: 'signature' }, 'unknown');
  }

  const lic = await deps.store.findLicense(input.license_id);
  const decision = decideStatus(lic, input.domain);
  // Привязка домена — только по подписанному запросу. Иначе любой, кто знает license_id (он не секрет),
  // мог бы неподписанным legacy-ping «занять» пустую лицензию своим доменом раньше настоящего клиента.
  if (decision.bind && lic && signedClient) await deps.store.bindDomain(lic.license_id, input.domain);

  const licId = lic ? lic.license_id : null;
  await maybeAlert(deps.store, deps.alert, input, licId, decision.status, now);
  await recordThrottled(deps.store, {
    license_id: licId,
    domain: input.domain,
    version: signedClient ? input.version : `${input.version} (legacy)`,
    ip: req.ip,
    user_agent: req.user_agent ? req.user_agent.slice(0, 200) : null,
    status: decision.status,
  }, now);
  return signedReply(key, 200, { ...base, status: decision.status }, decision.status);
}

// Запись в журнал не чаще PING_LOG_DEDUP_MS на (лицензия, домен, статус). Сбой проверки → пишем (журнал важнее).
async function recordThrottled(store: LicenseStore, row: PingRow, now: Date): Promise<void> {
  const since = new Date(now.getTime() - PING_LOG_DEDUP_MS).toISOString();
  const seen = await store.hasRecentSignal(row.license_id, row.domain, row.status, since).catch(() => false);
  if (!seen) await store.recordPing(row);
}

// Ключ rate limit: пара (license_id, IP). Только IP — клиенты на Vercel делят egress-адреса, лимит резал бы
// честные копии. Только license_id — злоумышленник, зная чужой license_id (он не секрет), исчерпал бы лимит жертвы.
// Тело не доверенное: license_id берём, только если это UUID; мусорные тела лимитируются по IP.
export function rateLimitKey(raw_body: string, ip: string | null): string {
  const parsed = PingBody.pick({ license_id: true }).safeParse(parseJson(raw_body));
  const who = `ip:${ip ?? 'none'}`;
  return parsed.success ? `license_ping:${parsed.data.license_id.toLowerCase()}:${who}` : `license_ping:${who}`;
}

// IP клиента из заголовков прокси (первый адрес в x-forwarded-for).
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  const first = fwd ? fwd.split(',')[0].trim() : '';
  return first || headers.get('x-real-ip') || null;
}

// ---------- Реализация хранилища на Supabase ----------

export function supabaseLicenseStore(): LicenseStore {
  const db = adminClient();
  return {
    async findLicense(license_id) {
      const { data, error } = await db
        .from('licenses').select('license_id, domain, allowed_domains, revoked').eq('license_id', license_id).maybeSingle();
      if (error) throw new Error(`licenses: ${error.message}`);
      return data ? { license_id: String(data.license_id), domain: data.domain, allowed_domains: data.allowed_domains, revoked: Boolean(data.revoked) } : null;
    },
    async recordPing(row) {
      // Ошибка записи журнала не должна менять ответ клиенту: статус уже определён.
      await db.from('license_pings').insert(row).then(() => undefined, () => undefined);
    },
    async hasRecentSignal(license_id, domain, status, sinceIso) {
      let q = db.from('license_pings').select('id').eq('domain', domain).eq('status', status).gte('pinged_at', sinceIso).limit(1);
      q = license_id ? q.eq('license_id', license_id) : q.is('license_id', null);
      const { data } = await q;
      return Boolean(data && data.length > 0);
    },
    async bindDomain(license_id, domain) {
      // Привязываем только «пустую» лицензию: условие в where защищает от гонки двух первых ping.
      await db.from('licenses').update({ domain, allowed_domains: [domain] })
        .eq('license_id', license_id).or(`domain.is.null,domain.eq."${UNBOUND_DOMAIN}"`);
    },
  };
}

export const telegramAlerter: Alerter = async (text) => {
  await notifyAdmin(text);
};

// Удаление ping старше retention (ТЗ §4.50). Вызывается из cron/backup. Возвращает число удалённых строк.
export async function purgeOldPings(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PING_RETENTION_DAYS * 86_400_000).toISOString();
  const { count, error } = await adminClient().from('license_pings').delete({ count: 'exact' }).lt('pinged_at', cutoff);
  if (error) throw new Error(`license_pings retention: ${error.message}`);
  return count ?? 0;
}

// ---------- Ручные операции супер-админа (route revoke и server actions /panel/licenses) ----------

export type LicenseKey = { by: 'id' | 'license_id'; value: string };
export type AdminResult = { ok: true; changed: boolean } | { ok: false; reason: 'not_found' | 'db' };

// Блокировка/разблокировка. Идемпотентно: повтор с тем же значением → changed=false, без лишнего audit.
export async function setLicenseRevoked(key: LicenseKey, revoked: boolean): Promise<AdminResult> {
  const db = adminClient();
  const { data: cur, error } = await db.from('licenses').select('id, revoked').eq(key.by, key.value).maybeSingle();
  if (error) return { ok: false, reason: 'db' };
  if (!cur) return { ok: false, reason: 'not_found' };
  if (Boolean(cur.revoked) === revoked) return { ok: true, changed: false };
  const { error: upd } = await db.from('licenses').update({ revoked }).eq('id', cur.id);
  return upd ? { ok: false, reason: 'db' } : { ok: true, changed: true };
}

// Разрешить дополнительный домен. Идемпотентно (Set).
export async function allowLicenseDomain(id: string, domain: string): Promise<AdminResult> {
  const db = adminClient();
  const host = normalizeDomain(domain);
  const { data: lic, error } = await db.from('licenses').select('allowed_domains').eq('id', id).maybeSingle();
  if (error) return { ok: false, reason: 'db' };
  if (!lic) return { ok: false, reason: 'not_found' };
  const current: string[] = lic.allowed_domains ?? [];
  if (current.includes(host)) return { ok: true, changed: false };
  const { error: upd } = await db.from('licenses').update({ allowed_domains: [...current, host] }).eq('id', id);
  return upd ? { ok: false, reason: 'db' } : { ok: true, changed: true };
}

export const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
