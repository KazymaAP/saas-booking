// lib/import2gis.ts — импорт выгрузки 2GIS (ТЗ §5.7, §13, §14, §46). Используют скрипт и загрузка в интерфейсе.
import { normalizePhone } from './phone';
import { slugify } from './slug';

export type Row = Record<string, unknown>;

const VERTICALS: [string[], string][] = [
  [['шин'], 'tire-service'],
  [['детейл', 'полиров', 'мойк'], 'detailing'],
  [['маникюр', 'ногт'], 'manicure'],
  [['саун', 'бан'], 'sauna'],
  [['барбер', 'стрижк'], 'barbershop'],
  [['автосервис', 'ремонт авто', 'автомойк'], 'auto-service'],
  [['фото'], 'photographer'],
  [['репетитор'], 'tutor'],
  [['клининг', 'уборк'], 'cleaning'],
  [['стомат'], 'dentistry'],
  [['ветклиник', 'ветеринар'], 'vet'],
];

export function verticalFor(rubric: string): string | null {
  const r = rubric.toLowerCase();
  for (const [keys, slug] of VERTICALS) if (keys.some((k) => r.includes(k))) return slug;
  return null;
}

function columnsMatching(headers: string[], re: RegExp): string[] {
  return headers.filter((h) => re.test(h));
}

function splitCell(raw: unknown): string[] {
  return String(raw ?? '').replace(/\([^)]*\)/g, ' ').split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
}

function phonesFrom(row: Row, cols: string[]): string[] {
  const out: string[] = [];
  for (const c of cols) for (const part of splitCell(row[c])) {
    const p = normalizePhone(part);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

function emailsFrom(row: Row, cols: string[]): string[] {
  const out: string[] = [];
  for (const c of cols) for (const part of splitCell(row[c])) {
    const e = part.toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

function websitesFrom(row: Row, cols: string[]): string[] {
  const out: string[] = [];
  for (const c of cols) for (const part of splitCell(row[c])) {
    const host = part.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (host && !out.includes(host)) out.push(host);
  }
  return out;
}

// §5.7: socials — первое непустое из колонок WhatsApp / Telegram.
function socialsFrom(row: Row): Record<string, string> | null {
  const wa = String(row['WhatsApp'] ?? '').trim();
  const tg = String(row['Telegram'] ?? '').trim();
  const out: Record<string, string> = {};
  if (wa) out.whatsapp = wa;
  if (tg) out.telegram = tg;
  return Object.keys(out).length ? out : null;
}

export type ImportStats = { total: number; selected: number; withEmail: number; created: number; updated: number; skipped: number; errors: string[] };

// db — клиент Supabase с service_role. rows — строки листа. Фильтр по рубрике — substring, регистронезависимо.
export async function importRows(db: any, rows: Row[], opts: { filter?: string; dryRun?: boolean } = {}): Promise<ImportStats> {
  const filter = (opts.filter ?? 'шин').toLowerCase();
  const headers = Object.keys(rows[0] ?? {});
  const phoneCols = columnsMatching(headers, /^Телефон/);
  const emailCols = columnsMatching(headers, /^E-mail/i);
  const siteCols = columnsMatching(headers, /^Веб-сайт/);
  const selected = rows.filter((r) => String(r['Рубрики'] ?? '').toLowerCase().includes(filter));
  const stats: ImportStats = { total: rows.length, selected: selected.length, withEmail: 0, created: 0, updated: 0, skipped: 0, errors: [] };

  if (opts.dryRun) {
    stats.withEmail = selected.filter((r) => emailsFrom(r, emailCols).length > 0).length;
    return stats;
  }

  const { data: templates } = await db.from('vertical_templates').select('id, slug');
  const templateBySlug = new Map((templates ?? []).map((t: any) => [t.slug, t.id]));
  const usedSlugs = new Set<string>();
  const seen = new Set<string>();
  let batch: any[] = [];

  const uniqueSlug = async (name: string) => {
    const base = slugify(name);
    let candidate = base;
    let n = 2;
    while (usedSlugs.has(candidate) || (await db.from('businesses').select('id').eq('slug', candidate).maybeSingle()).data) {
      candidate = `${base}-${n++}`;
    }
    usedSlugs.add(candidate);
    return candidate;
  };

  for (const r of selected) {
    const name = String(r['Наименование'] ?? '').trim();
    if (!name) { stats.skipped++; continue; }
    const phones = phonesFrom(r, phoneCols);
    const emails = emailsFrom(r, emailCols);
    const address = String(r['Адрес'] ?? '').trim();
    const rubric = String(r['Рубрики'] ?? '');
    const twoGis = String(r['2GIS URL'] ?? '').trim();
    const key = twoGis || `${phones[0] ?? ''}|${address}`;
    if (seen.has(key)) { stats.updated++; continue; } // дубль внутри выгрузки
    seen.add(key);

    const safe: Record<string, unknown> = {
      rating: Number(String(r['Рейтинг'] ?? '').replace(',', '.')) || null,
      reviews_count: Number(r['Количество отзывов'] ?? 0) || null,
      working_hours: r['Часы работы'] ? { raw: String(r['Часы работы']) } : undefined,
      phones,
      emails,
      websites: websitesFrom(r, siteCols),
      socials: socialsFrom(r),
    };
    Object.keys(safe).forEach((k) => safe[k] === undefined && delete safe[k]);

    // §46: повторный импорт обновляет только безопасные поля
    let existingId: string | null = null;
    if (twoGis) {
      existingId = (await db.from('businesses').select('id').eq('source_2gis_url', twoGis).maybeSingle()).data?.id ?? null;
    } else if (phones[0]) {
      existingId = (await db.from('businesses').select('id').contains('phones', [phones[0]]).eq('address', address).maybeSingle()).data?.id ?? null;
    }
    if (existingId) {
      const { error } = await db.from('businesses').update(safe).eq('id', existingId);
      if (error) stats.errors.push(error.message); else stats.updated++;
      continue;
    }

    const verticalSlug = verticalFor(rubric);
    batch.push({
      slug: await uniqueSlug(name),
      name,
      category: rubric,
      address,
      city: String(r['Город'] ?? '') || null,
      source_2gis_url: twoGis || null,
      vertical_template_id: verticalSlug ? templateBySlug.get(verticalSlug) ?? null : null,
      status: emails.length ? 'new' : 'no_contact',
      ...safe,
    });
    if (batch.length === 100) {
      const { error } = await db.from('businesses').insert(batch);
      if (error) stats.errors.push(error.message); else stats.created += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    const { error } = await db.from('businesses').insert(batch);
    if (error) stats.errors.push(error.message); else stats.created += batch.length;
  }
  return stats;
}
