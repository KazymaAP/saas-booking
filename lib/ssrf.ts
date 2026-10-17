// lib/ssrf.ts — безопасный fetch внешних URL (ТЗ §11.3 п.4, §17.9).
// Правила: только http/https, блок приватных/служебных IP ПОСЛЕ DNS resolve, таймаут 5 с, лимит 2 МБ,
// редиректы — вручную, каждый шаг проверяется заново. Соединение идёт на тот IP, который прошёл проверку
// (pinning через опцию lookup), поэтому DNS rebinding между проверкой и запросом не работает.
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';

export const SSRF_TIMEOUT_MS = 5000;
export const SSRF_MAX_BYTES = 2 * 1024 * 1024;
export const SSRF_MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
// Нестандартные порты чаще всего означают админки и внутренние сервисы.
const ALLOWED_PORTS: ReadonlySet<string> = new Set(['', '80', '443', '8080', '8443']);
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.localdomain'];
const BLOCKED_HOSTS: ReadonlySet<string> = new Set(['localhost', 'metadata.google.internal', 'metadata']);
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

export type SsrfReason =
  | 'invalid_url' | 'protocol' | 'credentials' | 'port' | 'host' | 'private_ip' | 'dns'
  | 'timeout' | 'too_large' | 'too_many_redirects' | 'network';

export class SsrfError extends Error {
  readonly reason: SsrfReason;
  constructor(reason: SsrfReason, message: string) {
    super(message);
    this.name = 'SsrfError';
    this.reason = reason;
  }
}

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;
export type ValidatedUrl = { url: URL; address: ResolvedAddress };

// ---------- IP-диапазоны ----------

// [сеть, длина префикса] — приватные, loopback, link-local, CGNAT, тестовые, multicast, reserved.
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

function inV4Range(ip: string, net: string, bits: number): boolean {
  const size = 2 ** (32 - bits);
  return Math.floor(ipv4ToInt(ip) / size) === Math.floor(ipv4ToInt(net) / size);
}

export function isPrivateIpv4(ip: string): boolean {
  return BLOCKED_V4.some(([net, bits]) => inV4Range(ip, net, bits));
}

// Разворачивает IPv6 в 8 групп по 16 бит. Поддерживает «::» и хвост в виде IPv4 (::ffff:1.2.3.4).
export function expandIpv6(ip: string): number[] {
  let text = ip.toLowerCase().replace(/%.*$/, '');
  const v4tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4tail) {
    const n = ipv4ToInt(v4tail[1]);
    text = `${text.slice(0, -v4tail[1].length)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const fill = text.includes('::') ? 8 - headParts.length - tailParts.length : 0;
  return [...headParts, ...Array<string>(fill).fill('0'), ...tailParts].map((h) => parseInt(h, 16) || 0);
}

function v4FromGroups(hi: number, lo: number): string {
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
}

export function isPrivateIpv6(ip: string): boolean {
  const g = expandIpv6(ip);
  if (g.every((x) => x === 0)) return true; // :: — unspecified
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 — loopback
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 — unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 — link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 — site-local (устаревший)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 — multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // 2001:db8::/32 — документация
  // Адреса со встроенным IPv4: mapped (::ffff:a.b.c.d), compatible (::a.b.c.d), NAT64 (64:ff9b::/96).
  const mapped = g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0);
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  if (mapped || nat64) return isPrivateIpv4(v4FromGroups(g[6], g[7]));
  if (g[0] === 0x2002) return isPrivateIpv4(v4FromGroups(g[1], g[2])); // 6to4
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true; // не IP — считаем небезопасным
}

// ---------- Проверка URL ----------

export const defaultResolver: Resolver = async (hostname) => {
  const list = await dnsLookup(hostname, { all: true, verbatim: true });
  return list.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

function isBlockedHostname(host: string): boolean {
  if (BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;
  // Однословные имена (intranet, router) резолвятся только во внутренних сетях.
  return !host.includes('.') && isIP(host) === 0;
}

// Разбор и синтаксическая проверка. Без DNS — пригодно для Zod-refine и быстрых проверок.
export function parseSafeUrl(raw: string): URL {
  const text = raw.trim();
  if (!text || text.length > MAX_URL_LENGTH) throw new SsrfError('invalid_url', 'Пустой или слишком длинный URL');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    throw new SsrfError('invalid_url', `Некорректный URL: ${text.slice(0, 100)}`);
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) throw new SsrfError('protocol', `Запрещённый протокол ${url.protocol}`);
  if (url.username || url.password) throw new SsrfError('credentials', 'URL с логином/паролем запрещён');
  if (!ALLOWED_PORTS.has(url.port)) throw new SsrfError('port', `Запрещённый порт ${url.port}`);
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || isBlockedHostname(host)) throw new SsrfError('host', `Запрещённый хост ${host}`);
  if (isIP(host) !== 0 && isPrivateIp(host)) throw new SsrfError('private_ip', `Приватный IP ${host}`);
  return url;
}

// Полная проверка: синтаксис + DNS. Все адреса хоста должны быть публичными (иначе rebinding через round-robin).
export async function validateUrl(raw: string, resolve: Resolver = defaultResolver): Promise<ValidatedUrl> {
  const url = parseSafeUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const literal = isIP(host);
  if (literal !== 0) return { url, address: { address: host, family: literal === 6 ? 6 : 4 } };
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new SsrfError('dns', `DNS не резолвит ${host}`);
  }
  if (addresses.length === 0) throw new SsrfError('dns', `DNS не вернул адресов для ${host}`);
  const bad = addresses.find((a) => isPrivateIp(a.address));
  if (bad) throw new SsrfError('private_ip', `${host} резолвится в приватный IP ${bad.address}`);
  return { url, address: addresses[0] };
}

// ---------- Запрос ----------

export type TransportResponse = { status: number; headers: IncomingHttpHeaders; body: Readable };
export type Transport = (target: ValidatedUrl, headers: Record<string, string>, signal: AbortSignal) => Promise<TransportResponse>;

// Транспорт по умолчанию: node:http(s) с pinned IP. SNI и Host берутся из исходного hostname.
export const defaultTransport: Transport = (target, headers, signal) =>
  new Promise((resolvePromise, reject) => {
    const pinned: LookupFunction = (_host, options, callback) => {
      if (options.all) callback(null, [{ address: target.address.address, family: target.address.family }]);
      else callback(null, target.address.address, target.address.family);
    };
    const send = target.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(target.url, { method: 'GET', headers, lookup: pinned, signal }, (res) => {
      resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body: res });
    });
    req.on('error', reject);
    req.end();
  });

// Читает поток не больше maxBytes. Превышение — ошибка too_large (поток уничтожается сразу).
export async function readLimited(body: Readable, maxBytes: number, declared?: string): Promise<Buffer> {
  if (declared && Number(declared) > maxBytes) {
    body.destroy();
    throw new SsrfError('too_large', `Content-Length ${declared} > ${maxBytes}`);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buf.length;
    if (total > maxBytes) {
      body.destroy();
      throw new SsrfError('too_large', `Ответ больше ${maxBytes} байт`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  resolve?: Resolver;
  transport?: Transport;
};

export type SafeResponse = { url: string; status: number; contentType: string; body: Buffer };

const DEFAULT_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': 'Mozilla/5.0 (compatible; ZapishisyaBot/1.0)',
  Accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5',
};

function toSsrfError(e: unknown, signal: AbortSignal): SsrfError {
  if (e instanceof SsrfError) return e;
  if (signal.aborted) return new SsrfError('timeout', 'Превышен таймаут запроса');
  return new SsrfError('network', e instanceof Error ? e.message : 'Сетевая ошибка');
}

// Один общий таймаут на всю цепочку (DNS + редиректы + чтение тела).
async function followChain(raw: string, opts: SafeFetchOptions, signal: AbortSignal): Promise<SafeResponse> {
  const resolve = opts.resolve ?? defaultResolver;
  const transport = opts.transport ?? defaultTransport;
  const maxRedirects = opts.maxRedirects ?? SSRF_MAX_REDIRECTS;
  const headers = { ...DEFAULT_HEADERS, ...opts.headers };
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const target = await validateUrl(current, resolve);
    const res = await transport(target, headers, signal);
    const location = res.headers.location;
    if (REDIRECT_STATUSES.has(res.status) && typeof location === 'string') {
      res.body.destroy();
      current = new URL(location, target.url).toString();
      continue;
    }
    const body = await readLimited(res.body, opts.maxBytes ?? SSRF_MAX_BYTES, res.headers['content-length']);
    return { url: target.url.toString(), status: res.status, contentType: String(res.headers['content-type'] ?? ''), body };
  }
  throw new SsrfError('too_many_redirects', `Больше ${maxRedirects} редиректов`);
}

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? SSRF_TIMEOUT_MS);
  // Гонка с таймаутом: подвисший DNS или транспорт без поддержки signal тоже прерываются.
  const timeout = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new SsrfError('timeout', 'Превышен таймаут запроса')), { once: true });
  });
  try {
    return await Promise.race([followChain(raw, opts, controller.signal), timeout]);
  } catch (e) {
    throw toSsrfError(e, controller.signal);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
