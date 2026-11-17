// служебное/scripts/generate-gera-data.ts
// Готовит public/gera-data.json для страницы /GERA: все организации из Excel,
// контакты, услуги и ссылка на готовый сайт (если он уже создан в Supabase).
//
// Запуск:
//   pnpm --dir D:/Clode/POLsaas-booking/project dlx tsx служебное/scripts/generate-gera-data.ts "<xlsx>"
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import * as XLSX from 'xlsx';
import { normalizePhone } from '../../общие/lib/phone';

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_XLSX = 'C:/Users/rrrme/OneDrive/Рабочий стол/organizations_20261117_0128.xlsx';
const TEMPLATE_URL = 'https://www.zapishisya.ru/d/lm-detail';

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value)).trim();
const splitList = (value: unknown): string[] => text(value)
  .split(/[;,\n]/)
  .map((part) => part.trim())
  .filter(Boolean);

function slugify(value: string): string {
  const latin = text(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
  return latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '') || 'business';
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
}

function normalizeAddress(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
}

function phoneAddressKey(phone: string, address: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `${normalized}|${normalizeAddress(address)}`;
}

type ParsedService = { name: string; price: number };

function parseServices(raw: unknown): ParsedService[] {
  return splitList(raw).map((part) => {
    const match = part.match(/^(.*?)\s*\(([\d\s]+)\s*₽\)\s*$/);
    if (match) return { name: text(match[1]), price: Number(match[2].replace(/\D/g, '')) || 0 };
    return { name: part, price: 0 };
  }).filter((service) => service.name.length > 0);
}

function socialUrl(value: unknown, kind: 'telegram' | 'max' | 'vk' | 'whatsapp'): string {
  const raw = text(value);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (kind === 'telegram') return `https://t.me/${raw.replace(/^@/, '')}`;
  if (kind === 'max') return `https://max.ru/${raw.replace(/^@/, '')}`;
  if (kind === 'vk') return `https://vk.com/${raw.replace(/^@/, '')}`;
  return `https://wa.me/${raw.replace(/\D/g, '')}`;
}

type BusinessRow = {
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  phones: string[] | null;
  status: string;
  subscription_active: boolean;
};

type GeraRow = {
  id: number;
  name: string;
  sphere: string;
  city: string;
  address: string;
  phones: string[];
  telegram: string;
  max: string;
  vk: string;
  whatsapp: string;
  map: string;
  rating: number | null;
  reviews: number | null;
  services: ParsedService[];
  siteUrl: string | null;
  exampleUrl: string;
};

async function loadBusinesses(): Promise<BusinessRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local');
  const response = await fetch(`${url}/rest/v1/businesses?select=slug,name,address,city,phones,status,subscription_active&limit=10000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`businesses: ${response.status} ${await response.text()}`);
  return await response.json() as BusinessRow[];
}

async function main() {
  const xlsxPath = process.argv[2] ?? DEFAULT_XLSX;
  loadEnvFile(join(PROJECT_DIR, '.env.local'));

  const workbook = XLSX.readFile(xlsxPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) throw new Error('В Excel нет листа с организациями');
  const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const businesses = await loadBusinesses();
  const bySlug = new Map(businesses.map((b) => [b.slug, b]));
  const byName = new Map<string, BusinessRow>();
  const byPhoneAddress = new Map<string, BusinessRow>();
  for (const business of businesses) {
    byName.set(normalizeName(business.name), business);
    for (const phone of business.phones ?? []) {
      const key = phoneAddressKey(phone, business.address ?? '');
      if (key) byPhoneAddress.set(key, business);
    }
  }

  const rows: GeraRow[] = source.map((row, index) => {
    const name = text(row['Название']) || `Организация ${index + 1}`;
    const city = text(row['Город']);
    const address = text(row['Адрес']);
    const phones = [...new Set(splitList(row['Телефон']).map((p) => normalizePhone(p)).filter((p): p is string => Boolean(p)))];

    let business = bySlug.get(slugify(name)) ?? byName.get(normalizeName(name)) ?? null;
    if (!business) {
      for (const phone of phones) {
        const found = byPhoneAddress.get(phoneAddressKey(phone, address) ?? '');
        if (found) { business = found; break; }
      }
    }
    const siteUrl = business && business.status === 'client' && business.subscription_active
      ? `https://www.zapishisya.ru/d/${business.slug}`
      : null;

    return {
      id: Number(row['№']) || index + 1,
      name,
      sphere: text(row['Сфера']),
      city,
      address,
      phones,
      telegram: socialUrl(row['Telegram'], 'telegram'),
      max: socialUrl(row['Макс'], 'max'),
      vk: socialUrl(row['VK'], 'vk'),
      whatsapp: socialUrl(row['WhatsApp'], 'whatsapp'),
      map: text(row['Карта']),
      rating: row['Оценка'] === '' ? null : Number(row['Оценка']),
      reviews: row['Отзывы'] === '' ? null : Number(row['Отзывы']),
      services: parseServices(row['Услуги']),
      siteUrl,
      exampleUrl: siteUrl ?? TEMPLATE_URL,
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    source: xlsxPath.split(/[\\/]/).pop() ?? 'organizations.xlsx',
    templateUrl: TEMPLATE_URL,
    total: rows.length,
    withSite: rows.filter((row) => row.siteUrl).length,
    rows,
  };

  const output = join(PROJECT_DIR, 'public', 'gera-data.json');
  writeFileSync(output, JSON.stringify(payload), 'utf8');
  console.log(JSON.stringify({
    output,
    total: payload.total,
    withSite: payload.withSite,
    bytes: readFileSync(output).length,
    phones: rows.filter((row) => row.phones.length > 0).length,
    telegram: rows.filter((row) => row.telegram).length,
    max: rows.filter((row) => row.max).length,
    vk: rows.filter((row) => row.vk).length,
    whatsapp: rows.filter((row) => row.whatsapp).length,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
