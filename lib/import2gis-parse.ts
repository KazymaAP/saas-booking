// lib/import2gis-parse.ts — чистые функции импорта 2GIS: чтение xlsx, нормализация, Zod, дедупликация.
// Без обращений к БД — всё покрыто unit-тестами. Оркестрация — lib/import2gis.ts, доступ к БД — lib/import2gis-store.ts.
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { normalizePhone } from './phone';
import { parseSafeUrl } from './ssrf';
import type { ExistingBusiness, NewBusiness, SafePatch } from './import2gis-store';

// Ячейка листа: SheetJS отдаёт string | number | boolean | Date, поэтому вход — unknown и сразу проходит через Zod.
export type Row = Record<string, unknown>;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 20_000;
const MAX_NAME_LENGTH = 300;
const MAX_TEXT_LENGTH = 1000;
const MAX_RATING = 5;
const REQUIRED_HEADERS = ['Наименование', 'Рубрики'] as const;
const TWO_GIS_HOST_RE = /(^|\.)2gis\.(ru|com|kz|ae|by|uz|kg|am|az|ge)$/;
const SOCIAL_HOSTS: Readonly<Record<'whatsapp' | 'telegram', ReadonlySet<string>>> = {
  whatsapp: new Set(['wa.me', 'api.whatsapp.com', 'whatsapp.com', 'chat.whatsapp.com']),
  telegram: new Set(['t.me', 'telegram.me']),
};

// Порядок важен: первая подходящая ниша по ПЕРВОЙ рубрике, где нашлось совпадение.
const VERTICALS: ReadonlyArray<readonly [readonly string[], string]> = [
  [['шин'], 'tire-service'],
  [['детейл', 'полиров', 'мойк'], 'detailing'],
  [['маникюр', 'ногт'], 'manicure'],
  [['саун', 'бан'], 'sauna'],
  [['барбер', 'стрижк'], 'barbershop'],
  [['автосервис', 'ремонт авто'], 'auto-service'],
  [['фото'], 'photographer'],
  [['репетитор'], 'tutor'],
  [['клининг', 'уборк'], 'cleaning'],
  [['стомат'], 'dentistry'],
  [['ветклиник', 'ветеринар'], 'vet'],
];

export class ImportError extends Error {
  readonly reason: 'empty' | 'headers' | 'too_many_rows' | 'too_large' | 'parse';
  constructor(reason: ImportError['reason'], message: string) {
    super(message);
    this.name = 'ImportError';
    this.reason = reason;
  }
}

export function verticalFor(rubric: string): string | null {
  for (const part of rubric.toLowerCase().split(/[;,]/)) {
    for (const [keys, slug] of VERTICALS) if (keys.some((k) => part.includes(k))) return slug;
  }
  return null;
}

// ---------- Чтение файла ----------

// Разбор книги с ограничениями: размер, число строк, обязательные колонки. Формулы и HTML не разбираются.
export function parseWorkbook(data: Uint8Array): Row[] {
  if (data.byteLength === 0) throw new ImportError('empty', 'Файл пустой');
  if (data.byteLength > MAX_FILE_BYTES) throw new ImportError('too_large', 'Файл больше 10 МБ');
  let wb: XLSX.WorkBook;
  try {
    // sheetRows считает и строку заголовков: +2 — чтобы лишняя строка данных дошла до проверки MAX_ROWS, а не обрезалась молча.
    wb = XLSX.read(data, { type: 'array', sheetRows: MAX_ROWS + 2, cellFormula: false, cellHTML: false, cellText: false });
  } catch (e) {
    throw new ImportError('parse', `Не удалось прочитать xlsx: ${e instanceof Error ? e.message : 'ошибка'}`);
  }
  const sheet = wb.SheetNames.length > 0 ? wb.Sheets[wb.SheetNames[0]] : undefined;
  if (!sheet) throw new ImportError('empty', 'В книге нет листов');
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
  if (rows.length === 0) throw new ImportError('empty', 'На первом листе нет строк');
  if (rows.length > MAX_ROWS) throw new ImportError('too_many_rows', `Больше ${MAX_ROWS} строк`);
  const headers = Object.keys(rows[0]);
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) throw new ImportError('headers', `Нет колонок: ${missing.join(', ')}`);
  return rows;
}

// ---------- Нормализация ----------

const cellText = (raw: unknown): string => (raw === null || raw === undefined ? '' : String(raw)).trim();

// Комментарий в скобках содержит буквы: «(отдел шиномонтажа)». Код города «(343)» — только цифры, его не трогаем.
const COMMENT_RE = /\([^)]*\p{L}[^)]*\)/gu;

// «89089240660 (отдел шиномонтажа); 8 (343) ...» → части без комментариев в скобках.
function splitCell(raw: unknown): string[] {
  return cellText(raw).replace(COMMENT_RE, ' ').split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
}

function collect(row: Row, cols: readonly string[], map: (part: string) => string | null): string[] {
  const out: string[] = [];
  for (const c of cols) {
    for (const part of splitCell(row[c])) {
      const value = map(part);
      if (value && !out.includes(value)) out.push(value);
    }
  }
  return out;
}

const EmailSchema = z.string().email().max(254);

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().replace(/^mailto:/i, '').toLowerCase();
  return EmailSchema.safeParse(e).success ? e : null;
}

// Сайт хранится как host (так его используют шаблон сайта и check-replies). Приватные/служебные хосты отбрасываются.
export function normalizeWebsite(raw: string): string | null {
  try {
    return parseSafeUrl(raw).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Ссылка мессенджера: только https и только официальные хосты (иначе в href попадёт javascript: или фишинг).
export function normalizeSocial(raw: unknown, kind: 'whatsapp' | 'telegram'): string | null {
  const text = cellText(raw).split(/[;,\s]/)[0] ?? '';
  if (!text) return null;
  try {
    const url = parseSafeUrl(text);
    return SOCIAL_HOSTS[kind].has(url.hostname.replace(/^www\./, '')) ? `https://${url.host}${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

export function normalize2gisUrl(raw: unknown): string | null {
  const text = cellText(raw);
  if (!text) return null;
  try {
    const url = parseSafeUrl(text);
    if (!TWO_GIS_HOST_RE.test(url.hostname)) return null;
    // Хвост ?m=... и #... у одной и той же фирмы разный — для ключа дедупликации он не нужен.
    return `https://${url.hostname}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

// \b в JS-регулярках понимает только латиницу, поэтому границы слова для кириллицы — через lookaround.
// Справа допускается цифра: «к2», «д5».
const word = (alternatives: string): RegExp => new RegExp(`(?<![\\p{L}\\d])(?:${alternatives})(?![\\p{L}])\\.?`, 'gu');
const ADDRESS_ABBREVIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [word('улица|ул'), 'ул'],
  [word('проспект|пр-т|просп|пр'), 'пр'],
  [word('переулок|пер'), 'пер'],
  [word('шоссе|ш'), 'ш'],
  [word('площадь|пл'), 'пл'],
  [word('бульвар|б-р|бул'), 'б-р'],
  [word('дом|д'), ''],
  [word('строение|стр'), 'стр'],
  [word('корпус|корп|к'), 'к'],
];

// Адрес для сравнения: регистр, ё, пунктуация, «улица/ул.», «д.», лишние пробелы не влияют на совпадение.
export function normalizeAddress(raw: string): string {
  let text = raw.toLowerCase().replace(/ё/g, 'е');
  for (const [re, short] of ADDRESS_ABBREVIATIONS) text = text.replace(re, ` ${short} `);
  return text
    .replace(/[.,;:"«»()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(raw: unknown): number | null {
  const text = cellText(raw).replace(',', '.').replace(/\s/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

// ---------- Кандидат (результат разбора одной строки) ----------

export const CandidateSchema = z.object({
  name: z.string().min(1, 'нет названия').max(MAX_NAME_LENGTH),
  category: z.string().max(MAX_TEXT_LENGTH),
  address: z.string().max(MAX_TEXT_LENGTH),
  city: z.string().max(MAX_NAME_LENGTH).nullable(),
  source_2gis_url: z.string().url().nullable(),
  phones: z.array(z.string().regex(/^\+7\d{10}$/)),
  emails: z.array(EmailSchema),
  websites: z.array(z.string().min(1)),
  socials: z.record(z.string().url()).nullable(),
  rating: z.number().min(0).max(MAX_RATING).nullable(),
  reviews_count: z.number().int().min(0).nullable(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export type Columns = { phone: string[]; email: string[]; site: string[] };

export function detectColumns(rows: readonly Row[]): Columns {
  const headers = Object.keys(rows[0] ?? {});
  return {
    phone: headers.filter((h) => /^Телефон/i.test(h)),
    email: headers.filter((h) => /^e-?mail/i.test(h)),
    site: headers.filter((h) => /^(Веб-сайт|Сайт)/i.test(h)),
  };
}

function socialsFrom(row: Row): Record<string, string> | null {
  const out: Record<string, string> = {};
  const wa = normalizeSocial(row['WhatsApp'], 'whatsapp');
  const tg = normalizeSocial(row['Telegram'], 'telegram');
  if (wa) out.whatsapp = wa;
  if (tg) out.telegram = tg;
  return Object.keys(out).length > 0 ? out : null;
}

// Строка xlsx → кандидат или текст ошибки (строка пропускается, причина попадает в статистику).
export function parseRow(row: Row, cols: Columns): { ok: true; value: Candidate } | { ok: false; error: string } {
  const reviews = toNumber(row['Количество отзывов']);
  const parsed = CandidateSchema.safeParse({
    name: cellText(row['Наименование']).replace(/\s+/g, ' '),
    category: cellText(row['Рубрики']),
    address: cellText(row['Адрес']),
    city: cellText(row['Город']) || null,
    source_2gis_url: normalize2gisUrl(row['2GIS URL']),
    phones: collect(row, cols.phone, normalizePhone),
    emails: collect(row, cols.email, normalizeEmail),
    websites: collect(row, cols.site, normalizeWebsite),
    socials: socialsFrom(row),
    rating: toNumber(row['Рейтинг']),
    reviews_count: reviews === null ? null : Math.trunc(reviews),
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, error: `${issue?.path.join('.') || 'row'}: ${issue?.message ?? 'invalid'}` };
}

// ---------- Дедупликация ----------

export const phoneAddressKey = (phone: string | undefined, address: string): string | null =>
  phone ? `${phone}|${normalizeAddress(address)}` : null;

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

// Дубль внутри файла: телефоны, email, сайты и мессенджеры дописываются к первой записи.
function mergeInto(target: Candidate, dup: Candidate): void {
  target.phones = union(target.phones, dup.phones);
  target.emails = union(target.emails, dup.emails);
  target.websites = union(target.websites, dup.websites);
  target.socials = dup.socials || target.socials ? { ...dup.socials, ...target.socials } : null;
  target.source_2gis_url = target.source_2gis_url ?? dup.source_2gis_url;
}

export function dedupeCandidates(list: readonly Candidate[]): { unique: Candidate[]; duplicates: number } {
  const byUrl = new Map<string, Candidate>();
  const byPhone = new Map<string, Candidate>();
  const unique: Candidate[] = [];
  let duplicates = 0;
  for (const original of list) {
    const c: Candidate = { ...original, phones: [...original.phones], emails: [...original.emails], websites: [...original.websites] };
    const key = phoneAddressKey(c.phones[0], c.address);
    const found = (c.source_2gis_url ? byUrl.get(c.source_2gis_url) : undefined) ?? (key ? byPhone.get(key) : undefined);
    // Разные 2GIS URL — разные филиалы, даже если телефон и адрес совпали.
    if (found && !(found.source_2gis_url && c.source_2gis_url && found.source_2gis_url !== c.source_2gis_url)) {
      mergeInto(found, c);
      duplicates++;
      continue;
    }
    unique.push(c);
    if (c.source_2gis_url) byUrl.set(c.source_2gis_url, c);
    if (key) byPhone.set(key, c);
  }
  return { unique, duplicates };
}

export function matchExisting(c: Candidate, byUrl: Map<string, ExistingBusiness>, byPhone: Map<string, ExistingBusiness>): ExistingBusiness | null {
  if (c.source_2gis_url) {
    const hit = byUrl.get(c.source_2gis_url);
    if (hit) return hit;
  }
  const key = phoneAddressKey(c.phones[0], c.address);
  const hit = key ? byPhone.get(key) : undefined;
  // Запись с другим 2GIS URL — другой филиал, не сливаем.
  if (!hit || (hit.source_2gis_url && c.source_2gis_url && hit.source_2gis_url !== c.source_2gis_url)) return null;
  return hit;
}

export function indexExisting(list: readonly ExistingBusiness[]): { byUrl: Map<string, ExistingBusiness>; byPhone: Map<string, ExistingBusiness> } {
  const byUrl = new Map<string, ExistingBusiness>();
  const byPhone = new Map<string, ExistingBusiness>();
  for (const b of list) {
    const url = normalize2gisUrl(b.source_2gis_url);
    if (url) byUrl.set(url, b);
    for (const p of b.phones ?? []) {
      const key = phoneAddressKey(p, b.address ?? '');
      if (key && !byPhone.has(key)) byPhone.set(key, b);
    }
  }
  return { byUrl, byPhone };
}

// Безопасные поля (ТЗ: rating, phones, emails и т.п.). name, slug, тексты и статус воронки не перезаписываются,
// кроме перехода no_contact → new, когда в выгрузке появился email.
export function safePatch(existing: ExistingBusiness, c: Candidate): SafePatch | null {
  const patch: SafePatch = {
    id: existing.id,
    name: existing.name,
    slug: existing.slug,
    rating: c.rating ?? existing.rating,
    reviews_count: c.reviews_count ?? existing.reviews_count,
    phones: union(existing.phones ?? [], c.phones),
    emails: union(existing.emails ?? [], c.emails),
    websites: union(existing.websites ?? [], c.websites),
    socials: existing.socials || c.socials ? { ...existing.socials, ...c.socials } : null,
    source_2gis_url: existing.source_2gis_url ?? c.source_2gis_url,
    status: existing.status === 'no_contact' && c.emails.length > 0 ? 'new' : existing.status,
  };
  const before = JSON.stringify([existing.rating, existing.reviews_count, existing.phones, existing.emails, existing.websites, existing.socials, existing.source_2gis_url, existing.status]);
  const after = JSON.stringify([patch.rating, patch.reviews_count, patch.phones, patch.emails, patch.websites, patch.socials, patch.source_2gis_url, patch.status]);
  return before === after ? null : patch;
}

export function toNewBusiness(c: Candidate, slug: string, templateId: string | null): NewBusiness {
  return {
    slug,
    name: c.name,
    category: c.category || null,
    address: c.address || null,
    city: c.city,
    source_2gis_url: c.source_2gis_url,
    vertical_template_id: templateId,
    status: c.emails.length > 0 ? 'new' : 'no_contact',
    rating: c.rating,
    reviews_count: c.reviews_count,
    phones: c.phones,
    emails: c.emails,
    websites: c.websites,
    socials: c.socials,
  };
}
