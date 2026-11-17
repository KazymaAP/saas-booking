// служебное/scripts/import-sites-from-excel.ts
// Импорт организаций из выгрузки Яндекса в публичные сайты SaaS.
//
// Запуск:
//   pnpm exec tsx служебное/scripts/import-sites-from-excel.ts "<файл.xlsx>" --limit=20 --photos=6
//   pnpm exec tsx служебное/scripts/import-sites-from-excel.ts "<файл.xlsx>" --dry-run --limit=20
//
// Поведение:
//   • одна организация = один сайт (business + services + photos);
//   • повторный запуск не дублирует businesses/services/photos;
//   • уже существующая запись с тем же slug/названием/телефоном+адресом обновляется и публикуется;
//   • фото скачиваются только с avatars.mds.yandex.net, загружаются в bucket `photos`;
//   • путь фото детерминирован из URL (SHA1 → UUID), поэтому повтор не создаёт копии.
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { CliError, err, loadEnvFile, out, parseArgs, readInputFile, runCli, serviceClient } from './cli';
import { normalizePhone } from '../../общие/lib/phone';
import {
  normalizeAddress, normalizeEmail, normalizeWebsite, verticalFor,
} from '../../общие/lib/import2gis-parse';
import { parseSafeUrl } from '../../общие/lib/ssrf';
import { BUCKET, MAX_UPLOAD_BYTES } from '../../общие/lib/photo-rules';

type Cell = Record<string, unknown>;

type ParsedService = { name: string; price: number; duration: number };

type Organization = {
  rowNumber: number;
  name: string;
  sphere: string;
  templateSlug: string;
  city: string;
  address: string;
  phones: string[];
  emails: string[];
  websites: string[];
  socials: Record<string, string>;
  rating: number | null;
  reviews: number | null;
  mapUrl: string | null;
  photoUrls: string[];
  services: ParsedService[];
  description: string;
  customTexts: Record<string, string>;
};

type ExistingBusiness = {
  id: string;
  slug: string;
  name: string;
  phones: string[] | null;
  address: string | null;
  city: string | null;
  status: string;
  notes: string | null;
};

const TEMPLATE_PREFIX: Readonly<Record<string, string>> = {
  'tire-service': 't',
  detailing: 'd',
  manicure: 'm',
  sauna: 'sa',
  barbershop: 'b',
  'auto-service': 'av',
  photographer: 'p',
  tutor: 'r',
  cleaning: 'c',
  dentistry: 'st',
  vet: 'v',
};

const PHOTO_HOSTS: ReadonlySet<string> = new Set(['avatars.mds.yandex.net']);
const PHOTO_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;
const SUBSCRIPTION_UNTIL = '2035-01-01';
const IMPORT_MARKER = 'organizations_20261117_0128.xlsx';
const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const WORKING_HOURS = {
  mon: [{ open: '09:00', close: '21:00' }],
  tue: [{ open: '09:00', close: '21:00' }],
  wed: [{ open: '09:00', close: '21:00' }],
  thu: [{ open: '09:00', close: '21:00' }],
  fri: [{ open: '09:00', close: '21:00' }],
  sat: [{ open: '10:00', close: '20:00' }],
  sun: [{ open: '10:00', close: '18:00' }],
};

const FALLBACK_SERVICES: readonly ParsedService[] = [
  { name: 'Комплексная мойка', price: 1500, duration: 60 },
  { name: 'Химчистка салона', price: 4500, duration: 180 },
  { name: 'Полировка кузова', price: 9000, duration: 240 },
  { name: 'Керамическое покрытие', price: 15000, duration: 480 },
];

const TRANSLIT: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const cellText = (raw: unknown): string => (raw === null || raw === undefined ? '' : String(raw)).trim();
const splitList = (raw: unknown): string[] => cellText(raw)
  .split(/[;,\n]/)
  .map((part) => part.trim())
  .filter(Boolean);

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
}

function slugify(value: string): string {
  const latin = cellText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
  return latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '') || 'business';
}

function durationFor(name: string, price: number): number {
  const n = name.toLowerCase();
  // Длительности эталонного детейлинга: мойка 1 ч, химчистка 3 ч, полировка 4 ч,
  // воск 3 ч, оклейка плёнкой 2 ч. Для остальных услуг — эвристика по названию и цене.
  if (n.includes('оклейк') || n.includes('пленк') || n.includes('плёнк') || n.includes('бронирован')) return 240;
  if (n.includes('керам')) return 480;
  if (n.includes('полиров')) return 240;
  if (n.includes('химчист') || n.includes('чистк') || n.includes('воск')) return 180;
  if (n.includes('тониров') || n.includes('вмят') || n.includes('ремонт')) return 120;
  if (price >= 50_000) return 480;
  if (price >= 15_000) return 240;
  if (price >= 5_000) return 120;
  return 60;
}

function parseService(raw: string): ParsedService | null {
  const text = cellText(raw).replace(/\s+/g, ' ');
  if (!text) return null;
  const priceMatch = /\(([\d\s\u00a0.,]+)\s*₽\)\s*$/u.exec(text);
  if (!priceMatch) {
    const name = text.replace(/[.;,]+$/, '');
    return { name, price: 0, duration: durationFor(name, 0) };
  }
  const price = Math.round(Number(priceMatch[1].replace(/[\s\u00a0]/g, '').replace(',', '.'))) || 0;
  const name = text.slice(0, priceMatch.index).replace(/[.;,]+$/, '').trim();
  if (!name) return null;
  return { name, price, duration: durationFor(name, price) };
}

function templateSlugFor(sphere: string): string {
  const lower = sphere.toLowerCase();
  if (lower.includes('детейл') || lower.includes('мойк') || lower.includes('полиров')) return 'detailing';
  return verticalFor(sphere) ?? 'detailing';
}

function safePhotoUrl(raw: string): string | null {
  try {
    const url = parseSafeUrl(raw);
    if (!PHOTO_HOSTS.has(url.hostname.replace(/^www\./, ''))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeSocialUrl(raw: string): string | null {
  try {
    return parseSafeUrl(raw).toString();
  } catch {
    return null;
  }
}

function toNumber(raw: unknown, min: number, max: number): number | null {
  const n = Number(cellText(raw).replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function parseOrganizations(rows: readonly Cell[], from: number, limit: number, sortBy: 'row' | 'reviews' = 'row'): Organization[] {
  const indexed = rows.map((row, index) => ({ row, rowNumber: index + 1 }));
  if (sortBy === 'reviews') {
    indexed.sort((a, b) => (toNumber(b.row['Отзывы'], 0, 1_000_000) ?? 0) - (toNumber(a.row['Отзывы'], 0, 1_000_000) ?? 0));
  }
  const slice = indexed.slice(Math.max(0, from - 1), Math.max(0, from - 1) + limit);
  const outList: Organization[] = [];
  for (let i = 0; i < slice.length; i += 1) {
    const { row, rowNumber } = slice[i];
    const name = cellText(row['Название']);
    if (!name) continue;
    const city = cellText(row['Город']);
    const rawAddress = cellText(row['Адрес']);
    const address = city && rawAddress.toLowerCase().endsWith(`, ${city.toLowerCase()}`)
      ? rawAddress.slice(0, rawAddress.length - city.length - 2).trim()
      : rawAddress;
    const phones = [...new Set(splitList(row['Телефон']).map(normalizePhone).filter((p): p is string => Boolean(p)))];
    const emails = [...new Set(splitList(row['Почта']).map(normalizeEmail).filter((e): e is string => Boolean(e)))];
    const websites = [...new Set(splitList(row['Сайт']).map(normalizeWebsite).filter((w): w is string => Boolean(w)))];
    const socials: Record<string, string> = {};
    const socialColumns: ReadonlyArray<readonly [string, string]> = [
      ['Telegram', 'telegram'], ['WhatsApp', 'whatsapp'], ['VK', 'vk'],
      ['Instagram', 'instagram'], ['Макс', 'max'],
    ];
    for (const [column, key] of socialColumns) {
      const url = safeSocialUrl(cellText(row[column]));
      if (url) socials[key] = url;
    }
    const photoUrls = [...new Set(splitList(row['Фото (все ссылки)']).map(safePhotoUrl).filter((u): u is string => Boolean(u)))];
    const sphere = cellText(row['Сфера']);
    const services = splitList(row['Услуги']).map(parseService).filter((s): s is ParsedService => Boolean(s));
    const templateSlug = templateSlugFor(sphere);
    const resultServices = services.length > 0 ? services : [...FALLBACK_SERVICES];
    const serviceList = resultServices.map((s) => s.name).slice(0, 4).join(', ');
    const description = `${serviceList}. Онлайн-запись без звонков — выберите услугу и удобное время.`;
    const mapUrl = safeSocialUrl(cellText(row['Карта']));

    outList.push({
      rowNumber,
      name,
      sphere,
      templateSlug,
      city,
      address,
      phones,
      emails,
      websites,
      socials,
      rating: toNumber(row['Оценка'], 0, 5),
      reviews: toNumber(row['Отзывы'], 0, 1_000_000),
      mapUrl,
      photoUrls,
      services: resultServices,
      description,
      customTexts: {
        hero_title: `${name} — онлайн-запись`,
        hero_subtitle: `${sphere} в ${city || 'вашем городе'}. Выберите услугу и удобное время без звонков.`,
        about: description,
      },
    });
  }
  return outList;
}

// SHA1 → UUID v5-подобный путь: валиден по photo-rules (isOwnPhotoPath) и стабилен между запусками.
function uuidFromUrl(url: string): string {
  const hex = createHash('sha1').update(url).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function loadExisting(db: ReturnType<typeof serviceClient>): Promise<ExistingBusiness[]> {
  const all: ExistingBusiness[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('businesses')
      .select('id, slug, name, phones, address, city, status, notes')
      .range(from, from + 999);
    if (error) throw new CliError(`Не удалось прочитать businesses: ${error.message}`);
    const rows = (data ?? []) as ExistingBusiness[];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

function phoneAddressKey(phone: string | undefined, address: string): string | null {
  return phone ? `${phone}|${normalizeAddress(address)}` : null;
}

function findExisting(
  org: Organization,
  bySlug: Map<string, ExistingBusiness>,
  byName: Map<string, ExistingBusiness>,
  byPhone: Map<string, ExistingBusiness>,
): ExistingBusiness | null {
  const foundBySlug = bySlug.get(slugify(org.name));
  if (foundBySlug) return foundBySlug;
  const foundByName = byName.get(normalizeName(org.name));
  if (foundByName) return foundByName;
  const key = phoneAddressKey(org.phones[0], org.address);
  return key ? byPhone.get(key) ?? null : null;
}

function uniqueSlug(org: Organization, used: Set<string>): string {
  const base = slugify(org.name);
  const phoneTail = org.phones[0]?.replace(/\D/g, '').slice(-4) ?? '';
  const candidates = [
    base,
    `${base}-${slugify(org.city).slice(0, 15)}`,
    phoneTail ? `${base}-${phoneTail}` : '',
    `${base}-${org.rowNumber}`,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  used.add(`${base}-${n}`);
  return `${base}-${n}`;
}

async function downloadPhoto(url: string): Promise<{ body: Buffer; contentType: string; ext: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZapishisyaSiteImport/1.0)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0) throw new Error('пустой файл');
    if (body.length > MAX_UPLOAD_BYTES) throw new Error(`больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ`);
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = PHOTO_EXT[contentType];
    if (!ext) throw new Error(`неизвестный тип ${contentType || 'без Content-Type'}`);
    return { body, contentType, ext };
  } finally {
    clearTimeout(timer);
  }
}

type Stats = {
  created: number;
  updated: number;
  services: number;
  photos: number;
  photoErrors: number;
  errors: string[];
};

async function importPhotos(
  db: ReturnType<typeof serviceClient>,
  org: Organization,
  businessId: string,
  perBusiness: number,
  stats: Stats,
): Promise<void> {
  const { data: existing, error } = await db
    .from('photos').select('id, path').eq('business_id', businessId);
  if (error) throw new CliError(`Не удалось прочитать фото (${org.name}): ${error.message}`);
  if (existing && existing.length > 0) return;

  const storage = db.storage.from(BUCKET);
  for (const [index, url] of org.photoUrls.slice(0, perBusiness).entries()) {
    try {
      const file = await downloadPhoto(url);
      const path = `${businessId}/${uuidFromUrl(url)}.${file.ext}`;
      const { error: uploadError } = await storage.upload(path, file.body, {
        contentType: file.contentType,
        upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data: pub } = storage.getPublicUrl(path);
      const { error: insertError } = await db.from('photos').insert({
        business_id: businessId,
        url: pub.publicUrl,
        path,
        alt: org.services[index % org.services.length]?.name ?? 'Работа студии',
        sort_order: index,
      });
      if (insertError) throw new Error(insertError.message);
      stats.photos += 1;
    } catch (e) {
      stats.photoErrors += 1;
      stats.errors.push(`Строка ${org.rowNumber}, фото ${index + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function ensureServices(
  db: ReturnType<typeof serviceClient>,
  org: Organization,
  businessId: string,
  stats: Stats,
): Promise<void> {
  const { count, error } = await db
    .from('services').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
  if (error) throw new CliError(`Не удалось прочитать услуги (${org.name}): ${error.message}`);
  if (count && count > 0) return;
  const rows = org.services.map((s, index) => ({
    business_id: businessId,
    name: s.name,
    price: s.price,
    duration_minutes: s.duration,
    sort_order: index + 1,
    is_active: true,
  }));
  const { error: insertError } = await db.from('services').insert(rows);
  if (insertError) throw new CliError(`Не удалось записать услуги (${org.name}): ${insertError.message}`);
  stats.services += rows.length;
}

function buildPatch(org: Organization, templateId: string, isNew: boolean, oldNotes: string | null) {
  const note = `Импорт сайта: ${IMPORT_MARKER}, строка ${org.rowNumber}${org.mapUrl ? `, карта: ${org.mapUrl}` : ''}`;
  const notes = oldNotes && oldNotes.includes(IMPORT_MARKER) ? oldNotes : [oldNotes, note].filter(Boolean).join('\n');
  const patch: Record<string, unknown> = {
    name: org.name,
    description: org.description,
    vertical_template_id: templateId,
    category: org.sphere,
    address: org.address || null,
    city: org.city || null,
    phones: org.phones,
    emails: org.emails,
    websites: org.websites,
    socials: org.socials,
    rating: org.rating,
    reviews_count: org.reviews,
    brand_color: '#4690ff',
    working_hours: WORKING_HOURS,
    slot_step_minutes: 30,
    cancel_hours_before: 24,
    min_hours_before: 1,
    max_days_ahead: 30,
    auto_confirm: true,
    status: 'client',
    plan: 'basic',
    subscription_active: true,
    subscription_until: SUBSCRIPTION_UNTIL,
    custom_texts: org.customTexts,
    custom_blocks: { show_map: true, show_gallery: true, show_reviews: false },
    onboarding_completed_at: new Date().toISOString(),
    notes,
  };
  if (isNew) patch.subscription_started_at = new Date().toISOString();
  return patch;
}

function positiveFlag(flags: Map<string, string | true>, key: string, fallback: number): number {
  const raw = flags.get(key);
  if (raw === undefined) return fallback;
  const value = Number(typeof raw === 'string' ? raw : '');
  if (!Number.isInteger(value) || value < 1) throw new CliError(`--${key}: целое число больше нуля`);
  return value;
}

async function main(): Promise<number> {
  const { positional, flags } = parseArgs(process.argv.slice(2), ['limit', 'photos', 'from', 'sort']);
  if (flags.has('help')) {
    out('Использование: pnpm exec tsx служебное/scripts/import-sites-from-excel.ts <файл.xlsx> [--from=1] [--limit=20] [--photos=6] [--sort=reviews] [--dry-run] [--json]');
    return 0;
  }
  const unknown = [...flags.keys()].filter((k) => !['limit', 'photos', 'from', 'sort', 'dry-run', 'json', 'help'].includes(k));
  if (unknown.length > 0) throw new CliError(`Неизвестные параметры: ${unknown.map((k) => `--${k}`).join(', ')}`);

  const from = positiveFlag(flags, 'from', 1);
  const limit = positiveFlag(flags, 'limit', 20);
  const photosPerBusiness = positiveFlag(flags, 'photos', 6);
  const sortBy = flags.get('sort') === 'reviews' ? 'reviews' : 'row';
  const dryRun = flags.has('dry-run');
  const data = readInputFile(positional[0], MAX_FILE_BYTES, /\.xlsx$/i);

  const workbook = XLSX.read(data, { type: 'buffer', cellFormula: false, cellHTML: false, cellText: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) throw new CliError('В книге нет листов');
  const rows = XLSX.utils.sheet_to_json<Cell>(sheet, { defval: '', raw: false });
  const orgs = parseOrganizations(rows, from, limit, sortBy);
  if (orgs.length === 0) throw new CliError('В выбранном диапазоне нет организаций с названием');

  if (dryRun) {
    const report = {
      dryRun: true,
      organizations: orgs.length,
      preview: orgs.map((o) => ({
        row: o.rowNumber,
        name: o.name,
        slug: slugify(o.name),
        prefix: TEMPLATE_PREFIX[o.templateSlug] ?? 'd',
        services: o.services.length,
        photos: Math.min(o.photoUrls.length, photosPerBusiness),
        phones: o.phones.length,
      })),
    };
    if (flags.has('json')) out(JSON.stringify(report, null, 2));
    else {
      out(`Проверка без записи в БД: организаций ${report.organizations}`);
      for (const p of report.preview) out(`  ${p.row}. ${p.name} → /${p.prefix}/${p.slug}, услуг ${p.services}, фото ${p.photos}`);
    }
    return 0;
  }

  loadEnvFile(join(PROJECT_DIR, '.env.local'));
  loadEnvFile(join(PROJECT_DIR, '.env'));
  const db = serviceClient();

  const { data: templates, error: templateError } = await db
    .from('vertical_templates').select('id, slug');
  if (templateError) throw new CliError(`Не удалось прочитать шаблоны: ${templateError.message}`);
  const templateIds = new Map((templates ?? []).map((t) => [t.slug as string, t.id as string]));

  const existing = await loadExisting(db);
  const bySlug = new Map(existing.map((b) => [b.slug, b]));
  const byName = new Map<string, ExistingBusiness>();
  const byPhone = new Map<string, ExistingBusiness>();
  for (const b of existing) {
    const nameKey = normalizeName(b.name ?? '');
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, b);
    for (const phone of b.phones ?? []) {
      const key = phoneAddressKey(normalizePhone(phone) ?? undefined, b.address ?? '');
      if (key && !byPhone.has(key)) byPhone.set(key, b);
    }
  }
  const usedSlugs = new Set(existing.map((b) => b.slug));

  const stats: Stats = { created: 0, updated: 0, services: 0, photos: 0, photoErrors: 0, errors: [] };

  for (const org of orgs) {
    const templateId = templateIds.get(org.templateSlug);
    if (!templateId) {
      stats.errors.push(`Строка ${org.rowNumber}: нет шаблона '${org.templateSlug}' — пропуск`);
      continue;
    }
    const found = findExisting(org, bySlug, byName, byPhone);
    const patch = buildPatch(org, templateId, !found, found?.notes ?? null);
    let businessId = '';
    try {
      if (found) {
        const { error } = await db.from('businesses').update(patch).eq('id', found.id);
        if (error) throw new Error(error.message);
        businessId = found.id;
        stats.updated += 1;
      } else {
        const slug = uniqueSlug(org, usedSlugs);
        const { data, error } = await db.from('businesses').insert({ slug, ...patch }).select('id').single();
        if (error) throw new Error(error.message);
        if (!data?.id) throw new Error('не получен id созданного сайта');
        businessId = data.id as string;
        stats.created += 1;
      }
      await ensureServices(db, org, businessId, stats);
      await importPhotos(db, org, businessId, photosPerBusiness, stats);
    } catch (e) {
      stats.errors.push(`Строка ${org.rowNumber} (${org.name}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const report = {
    organizations: orgs.length,
    created: stats.created,
    updated: stats.updated,
    services: stats.services,
    photos: stats.photos,
    photoErrors: stats.photoErrors,
    errors: stats.errors,
  };
  if (flags.has('json')) out(JSON.stringify(report, null, 2));
  else {
    out(`Импорт завершён: организаций ${report.organizations}, создано сайтов ${report.created}, обновлено ${report.updated}`);
    out(`  услуг добавлено: ${report.services}, фото загружено: ${report.photos}, ошибок фото: ${report.photoErrors}`);
    if (report.errors.length > 0) report.errors.forEach((e) => err(`  - ${e}`));
  }
  return report.errors.length > 0 ? 3 : 0;
}

runCli(main);
