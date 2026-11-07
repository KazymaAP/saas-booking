// lib/site.ts — адрес сервиса в одном месте. Смена домена = смена NEXT_PUBLIC_SITE_URL.
// Модуль без зависимостей от Node: импортируется и из middleware (Edge), и из серверного кода.

export const DEFAULT_SITE_URL = 'https://zapishisya.ru';

// Допустимое имя хоста после нормализации: латиница, цифры, точка, дефис (IDN приходят в punycode).
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Хосты разработки, которые никогда не считаются кастомным доменом клиента.
const DEV_HOSTS = ['localhost', '127.0.0.1'] as const;

// Превью-деплои Vercel — тоже основной сайт.
const PREVIEW_HOST_SUFFIX = '.vercel.app';

// Приводит адрес сервиса к виду https://host без завершающего слэша. Некорректное значение → дефолт.
export function normalizeSiteUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_SITE_URL;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return DEFAULT_SITE_URL;
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

// Нормализует значение заголовка Host: нижний регистр, без порта и завершающей точки.
// Некорректный хост (пробелы, спецсимволы, IPv6, пустая строка) → ''.
export function normalizeHost(raw: string | null | undefined): string {
  const host = (raw ?? '').trim().toLowerCase().replace(/:\d{1,5}$/, '').replace(/\.$/, '');
  return HOSTNAME_RE.test(host) ? host : '';
}

// Основной домен и его www-вариант. Порт не учитывается: normalizeHost его отрезает.
export function mainHostsFor(site_url: string): readonly string[] {
  const apex = new URL(site_url).hostname.replace(/^www\./, '');
  return [apex, `www.${apex}`, ...DEV_HOSTS];
}

// Дополнительные основные хосты из env (через запятую): алиасы, CDN, старые домены.
// Не заменяют выведенные из SITE_URL, а дополняют их. Некорректные значения отбрасываются.
export function mainHostsFromEnv(site_url: string): readonly string[] {
  const base = mainHostsFor(site_url);
  const extra = (process.env.NEXT_PUBLIC_MAIN_HOSTS ?? '')
    .split(',')
    .map((h) => normalizeHost(h))
    .filter((h) => h.length > 0);
  if (extra.length === 0) return base;
  // Без дублей, порядок: выведенные сначала, затем дополнительные.
  return [...new Set([...base, ...extra])];
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
export const SITE_HOST = new URL(SITE_URL).hostname;
export const MAIN_HOSTS: readonly string[] = mainHostsFromEnv(SITE_URL);

// Хост основного сайта (не кастомный домен клиента). Пустой/некорректный хост считается основным:
// такой запрос не должен уходить в резолв доменов.
export function isMainHost(raw: string | null | undefined, main_hosts: readonly string[] = MAIN_HOSTS): boolean {
  const host = normalizeHost(raw);
  if (!host) return true;
  return main_hosts.includes(host) || host.endsWith(PREVIEW_HOST_SUFFIX);
}
