// lib/legacy-csv.ts — разбор CSV legacy-клиентов для scripts/migrate-legacy.ts (чистые функции, покрыты тестами).
// Колонки: slug, name, city, phone, email, subscription_until, old_domain, new_url (+ необязательная vertical).
import { z } from 'zod';
import { normalizePhone } from './phone';
import { isValidSlug, slugify } from './slug';
import { parseSafeUrl } from './ssrf';

export const LEGACY_COLUMNS = ['slug', 'name', 'city', 'phone', 'email', 'subscription_until', 'old_domain', 'new_url'] as const;
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
const REQUIRED_COLUMNS = ['name'] as const;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RU_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export class CsvError extends Error {}

// RFC 4180: кавычки, "" внутри кавычек, запятые и переводы строк внутри поля. Разделитель — «,» или «;» (Excel RU).
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new CsvError('Незакрытая кавычка в CSV');
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toRecords(rows: readonly string[][]): Array<Record<string, string>> {
  const [head, ...body] = rows;
  if (!head) throw new CsvError('CSV пустой');
  const cols = head.map((c) => c.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
  if (missing.length > 0) throw new CsvError(`Нет колонок: ${missing.join(', ')}`);
  return body.map((cells) => Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()])));
}

// «2025-12-31» или «31.12.2025» → ISO-дата; несуществующая дата (31.02) — ошибка.
export function parseDate(raw: string): string | null {
  const iso = raw.match(DATE_RE);
  const ru = raw.match(RU_DATE_RE);
  let parts: [string, string, string] | null = null;
  if (iso) parts = [iso[1], iso[2], iso[3]];
  else if (ru) parts = [ru[3], ru[2], ru[1]];
  if (!parts) return null;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCDate() === Number(d) && date.getUTCMonth() === Number(m) - 1 ? `${y}-${m}-${d}` : null;
}

export function normalizeDomain(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return DOMAIN_RE.test(host) ? host : null;
}

const optional = (s: string | undefined): string | undefined => (s && s.trim() !== '' ? s.trim() : undefined);

const LegacySchema = z.object({
  slug: z.string().optional().transform((s, ctx) => {
    if (!s) return undefined;
    if (!isValidSlug(s)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'slug: только a-z0-9-, до 60 символов' });
    return s;
  }),
  name: z.string().min(1, 'name: пусто').max(300),
  city: z.string().max(300).optional(),
  phone: z.string().optional().transform((s, ctx) => {
    if (!s) return undefined;
    const p = normalizePhone(s);
    if (!p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `phone: не распознан «${s.slice(0, 30)}»` });
    return p ?? undefined;
  }),
  email: z.string().optional().transform((s, ctx) => {
    if (!s) return undefined;
    const e = s.toLowerCase();
    if (!z.string().email().max(254).safeParse(e).success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `email: некорректный «${s.slice(0, 60)}»` });
    return e;
  }),
  subscription_until: z.string().optional().transform((s, ctx) => {
    if (!s) return undefined;
    const d = parseDate(s);
    if (!d) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `subscription_until: дата ГГГГ-ММ-ДД или ДД.ММ.ГГГГ, а не «${s.slice(0, 20)}»` });
    return d ?? undefined;
  }),
  old_domain: z.string().optional().transform((s, ctx) => {
    if (!s) return undefined;
    const d = normalizeDomain(s);
    if (!d) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `old_domain: некорректный «${s.slice(0, 60)}»` });
    return d ?? undefined;
  }),
  // new_url попадает в редирект — только публичный http(s), иначе открытый редирект на javascript: или localhost.
  new_url: z.string().optional().transform((s, ctx) => {
    if (!s) return undefined;
    try {
      return parseSafeUrl(s).toString();
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `new_url: небезопасный или некорректный URL «${s.slice(0, 60)}»` });
      return undefined;
    }
  }),
  vertical: z.string().regex(/^[a-z0-9-]+$/, 'vertical: slug ниши').optional(),
});

export type LegacyRecord = {
  slug: string; name: string; city: string | null; phones: string[]; emails: string[];
  subscription_until: string | null; redirect: { from_domain: string; to_url: string } | null; vertical: string | null;
};

export type ParsedLegacy = { records: LegacyRecord[]; errors: string[]; duplicates: number };

function toRecord(row: Record<string, string>): { ok: true; value: LegacyRecord } | { ok: false; error: string } {
  const input = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, optional(v)]));
  const r = LegacySchema.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
  const d = r.data;
  const redirect = d.old_domain && d.new_url ? { from_domain: d.old_domain, to_url: d.new_url } : null;
  return {
    ok: true,
    value: {
      slug: d.slug ?? slugify(d.name), name: d.name, city: d.city ?? null, phones: d.phone ? [d.phone] : [],
      emails: d.email ? [d.email] : [], subscription_until: d.subscription_until ?? null, redirect, vertical: d.vertical ?? null,
    },
  };
}

// CSV → проверенные записи. Невалидная строка пропускается с номером строки файла; повтор slug — последняя строка побеждает.
export function parseLegacyCsv(text: string): ParsedLegacy {
  const records = new Map<string, LegacyRecord>();
  const errors: string[] = [];
  let duplicates = 0;
  toRecords(parseCsv(text)).forEach((row, i) => {
    const res = toRecord(row);
    // +2: строка 1 — заголовки.
    if (!res.ok) { errors.push(`Строка ${i + 2}: ${res.error}`); return; }
    if (records.has(res.value.slug)) duplicates++;
    records.set(res.value.slug, res.value);
  });
  return { records: [...records.values()], errors, duplicates };
}
