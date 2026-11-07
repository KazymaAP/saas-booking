// lib/domain-map.ts — подписанная cookie «кастомный домен → prefix/slug» (ТЗ §3.4: middleware читает только cookie, host, path).
// Ставит её app/api/resolve-domain (Node, есть БД), читает middleware (Edge, без БД и без fetch).
// Подпись HMAC-SHA256 через Web Crypto: работает и в Edge, и в Node 20. Ключ выводится из ENCRYPTION_KEY с меткой,
// поэтому сам ENCRYPTION_KEY (шифрование SMTP-паролей) не используется напрямую для другой цели.

export const DOMAIN_MAP_COOKIE = 'domain_map';

// Маркер повторного захода после установки cookie (query-параметр): защищает от бесконечного цикла редиректов.
export const DOMAIN_MAP_MARKER = '__dm';

// Заголовки запроса, через которые middleware передаёт данные в /api/resolve-domain при rewrite.
// Query-параметры rewrite не годятся: в Next 14 route handler видит в req.url исходный адрес запроса,
// а не адрес rewrite (проверено на `next start`), поэтому host/next терялись и маршрут отвечал 400.
export const RESOLVE_HOST_HEADER = 'x-resolve-host';
export const RESOLVE_NEXT_HEADER = 'x-resolve-next';
export const RESOLVE_RETRY_HEADER = 'x-resolve-retry';

// Время жизни сопоставления. Короткое: смена slug/домена в админке подхватится не позже чем через 10 минут.
export const DOMAIN_MAP_TTL_SECONDS = 600;

const KEY_LABEL = 'domain-map:v1:';
const PREFIX_RE = /^[a-z]{1,4}$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const FIELD_SEPARATOR = '|';
const MS_IN_SECOND = 1000;

export type DomainMap = {
  host: string;
  prefix: string;
  slug: string;
  status: string;
  // Unix-время истечения, секунды.
  exp: number;
};

const encoder = new TextEncoder();

// Ключ кэшируется по значению секрета: смена env (тесты, ротация) даёт новый ключ.
let key_cache: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(secret: string): Promise<CryptoKey> {
  if (key_cache?.secret !== secret) {
    const key = crypto.subtle
      .digest('SHA-256', encoder.encode(KEY_LABEL + secret))
      .then((raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
    key_cache = { secret, key };
  }
  return key_cache.key;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  // Длина base64 по модулю 4 не может быть 1 — такое значение atob отвергнет исключением.
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isValidPrefix(value: string): boolean {
  return PREFIX_RE.test(value);
}

export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value);
}

function serialize(map: DomainMap): string {
  return [map.host, map.prefix, map.slug, map.status, String(map.exp)].join(FIELD_SEPARATOR);
}

function parse(payload: string): DomainMap | null {
  const parts = payload.split(FIELD_SEPARATOR);
  if (parts.length !== 5) return null;
  const [host = '', prefix = '', slug = '', status = '', exp_raw = ''] = parts;
  const exp = Number(exp_raw);
  if (!host || !isValidPrefix(prefix) || !isValidSlug(slug) || !/^[a-z_]{1,32}$/.test(status)) return null;
  if (!Number.isInteger(exp)) return null;
  return { host, prefix, slug, status, exp };
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / MS_IN_SECOND);
}

// Подписывает сопоставление. Нет секрета → null (middleware тогда уводит на основной домен).
export async function signDomainMap(map: DomainMap, secret: string | undefined): Promise<string | null> {
  if (!secret) return null;
  const payload = serialize(map);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

// Проверяет подпись, срок и совпадение хоста. Любая ошибка → null, без исключений.
export async function verifyDomainMap(
  value: string | undefined,
  host: string,
  secret: string | undefined,
  now: number = nowSeconds(),
): Promise<DomainMap | null> {
  if (!value || !secret) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const signature = fromBase64Url(value.slice(dot + 1));
  if (!signature) return null;
  // verify сравнивает подпись за постоянное время.
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), signature, encoder.encode(payload));
  if (!valid) return null;
  const map = parse(payload);
  if (!map || map.host !== host || map.exp <= now) return null;
  return map;
}
