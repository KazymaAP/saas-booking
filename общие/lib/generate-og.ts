// lib/generate-og.ts — og:image с сайта клиента (ТЗ §11.3 п.3, п.4, п.7). Только через SSRF-safe fetch:
// http/https, публичные IP после DNS, общий бюджет 5 с на страницу и картинку, лимит 2 МБ на каждый ответ.
import { parseSafeUrl, safeFetch, SSRF_MAX_BYTES, SSRF_TIMEOUT_MS, SsrfError, type SafeFetchOptions, type SafeResponse } from './ssrf';

export type Fetcher = (url: string, opts: SafeFetchOptions) => Promise<SafeResponse>;

export type OgOptions = {
  fetcher?: Fetcher;
  budgetMs?: number;
  now?: () => number;
  // Повторы только для временных сбоев (таймаут, сеть). Блокировка SSRF не повторяется.
  attempts?: number;
};

export const OG_BUDGET_MS = SSRF_TIMEOUT_MS;
export const OG_ATTEMPTS = 2;
// og:image всегда в <head>; дальше разбирать HTML бессмысленно и дорого.
const HEAD_SCAN_BYTES = 512 * 1024;
// Меньше этого бюджета новый запрос не начинаем: всё равно не успеет.
const MIN_REQUEST_MS = 300;
const HTML_TYPES = ['text/html', 'application/xhtml+xml'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'];
const OG_KEYS = ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src'];
const TRANSIENT: ReadonlySet<string> = new Set(['timeout', 'network', 'dns']);

const META_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' };

const decodeEntities = (s: string): string => s.replace(/&(amp|quot|#39|apos|lt|gt);/g, (m) => ENTITIES[m] ?? m);

function metaAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const m of tag.matchAll(ATTR_RE)) attrs.set(m[1].toLowerCase(), decodeEntities(m[2] ?? m[3] ?? m[4] ?? '').trim());
  return attrs;
}

// Ищет og:image в HTML при любом порядке атрибутов, в property= и name=. Приоритет — по порядку OG_KEYS.
export function extractOgImage(html: string): string | null {
  const found = new Map<string, string>();
  for (const tag of html.match(META_RE) ?? []) {
    const attrs = metaAttributes(tag);
    const key = (attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase();
    const content = attrs.get('content');
    if (content && OG_KEYS.includes(key) && !found.has(key)) found.set(key, content);
  }
  for (const key of OG_KEYS) {
    const value = found.get(key);
    if (value) return value;
  }
  return null;
}

const mime = (contentType: string): string => contentType.split(';')[0].trim().toLowerCase();

// Относительный og:image → абсолютный от итогового URL страницы (после редиректов). Небезопасный — null.
export function resolveImageUrl(raw: string, pageUrl: string): string | null {
  try {
    return parseSafeUrl(new URL(raw, pageUrl).toString()).toString();
  } catch {
    return null;
  }
}

type Budget = { left: () => number };

async function fetchWithin(url: string, budget: Budget, opts: OgOptions): Promise<SafeResponse | null> {
  const fetcher = opts.fetcher ?? safeFetch;
  const attempts = Math.max(1, opts.attempts ?? OG_ATTEMPTS);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const timeoutMs = budget.left();
    if (timeoutMs < MIN_REQUEST_MS) return null;
    try {
      return await fetcher(url, { timeoutMs, maxBytes: SSRF_MAX_BYTES });
    } catch (e) {
      // Приватный IP, запрещённый протокол, слишком большой ответ — повтор ничего не изменит.
      if (!(e instanceof SsrfError) || !TRANSIENT.has(e.reason)) return null;
    }
  }
  return null;
}

async function findImageUrl(site: string, budget: Budget, opts: OgOptions): Promise<string | null> {
  const page = await fetchWithin(site, budget, opts);
  if (!page || page.status !== 200 || !HTML_TYPES.includes(mime(page.contentType))) return null;
  const raw = extractOgImage(page.body.subarray(0, HEAD_SCAN_BYTES).toString('utf8'));
  return raw ? resolveImageUrl(raw, page.url) : null;
}

// Возвращает URL картинки, только если она реально отдаётся: 200, image/*, не больше 2 МБ.
// Любая ошибка — null (вызывающий подставит SVG с инициалами).
export async function fetchOgImage(site: string | null | undefined, opts: OgOptions = {}): Promise<string | null> {
  if (!site) return null;
  let start: URL;
  try {
    start = parseSafeUrl(site);
  } catch {
    return null;
  }
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.budgetMs ?? OG_BUDGET_MS);
  const budget: Budget = { left: () => deadline - now() };
  const imageUrl = await findImageUrl(start.toString(), budget, opts);
  if (!imageUrl) return null;
  const image = await fetchWithin(imageUrl, budget, opts);
  if (!image || image.status !== 200 || !IMAGE_TYPES.includes(mime(image.contentType)) || image.body.length === 0) return null;
  return image.url;
}
