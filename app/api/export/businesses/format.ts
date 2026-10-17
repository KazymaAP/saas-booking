// app/api/export/businesses/format.ts — форматирование строк экспорта бизнесов (CSV/XLSX). Чистые функции — для тестов.
// Набор колонок не меняется (внешний формат файла, его открывают в Excel/Google Sheets оператора).

export const COLUMNS = [
  'id', 'name', 'slug', 'status', 'city', 'address', 'phones', 'emails', 'websites', 'rating', 'reviews_count',
  'custom_domain', 'ssl_status', 'subscription_until', 'created_at',
] as const;
export type Column = (typeof COLUMNS)[number];
export type ExportRow = Partial<Record<Column, unknown>>;

// Значение ячейки как текст: массивы (телефоны, email, сайты) — через «; ».
export function plain(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(plain).join('; ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Защита от CSV/формульной инъекции (OWASP): название из 2GIS вида «=HYPERLINK(...)» Excel выполнил бы как формулу.
// Строки без букв после +/- («+7 (999) 123-45-67; +7…», «-5») не трогаем: без букв формула не вызовет функцию (HYPERLINK, DDE).
const FORMULA_RE = /^(?:[=@\t\r]|[+-](?![\d\s().,;+-]*$))/;
export function safeText(s: string): string {
  return FORMULA_RE.test(s) ? `'${s}` : s;
}

export function csvCell(v: unknown): string {
  const s = safeText(plain(v));
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(row: ExportRow): string {
  return COLUMNS.map((c) => csvCell(row[c])).join(',');
}

export const CSV_HEADER = COLUMNS.join(',');
// BOM: без него Excel открывает UTF-8 как cp1251 и кириллица превращается в «кракозябры».
export const BOM = '\uFEFF';

export function xlsxRecord(row: ExportRow): Record<Column, string | number> {
  const out = {} as Record<Column, string | number>;
  for (const c of COLUMNS) {
    const v = row[c];
    out[c] = typeof v === 'number' ? v : safeText(plain(v));
  }
  return out;
}

// Имя файла: только латиница/цифры/дефис — заголовок Content-Disposition без экранирования.
export function fileBase(status: string, date: Date): string {
  const tag = status.replace(/[^a-z_]/g, '');
  return `businesses${tag ? `-${tag}` : ''}-${date.toISOString().slice(0, 10)}`;
}
