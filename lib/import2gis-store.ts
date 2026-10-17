// lib/import2gis-store.ts — доступ к БД для импорта 2GIS. Все запросы пакетные (без N+1):
// поиск существующих — по 100 ключей за запрос, вставка и обновление — по 100 строк, upsert с ON CONFLICT.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
export const LOOKUP_CHUNK = 100;
// Фильтры .in()/.or() уходят в query string GET-запроса. 100 URL или slug в процентной кодировке — 8–14 КБ,
// что упирается в лимит URI у прокси перед PostgREST (414). Поэтому пачку режем и по длине значений.
export const MAX_FILTER_CHARS = 4000;

// Пачки не больше size элементов и не больше maxChars суммарной длины в %-кодировке (кириллица — ×6 символов).
export function chunkForFilter(items: readonly string[], size = LOOKUP_CHUNK, maxChars = MAX_FILTER_CHARS): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const item of items) {
    const cost = encodeURIComponent(item).length + 1;
    if (current.length > 0 && (current.length >= size || length + cost > maxChars)) {
      out.push(current);
      current = [];
      length = 0;
    }
    current.push(item);
    length += cost;
  }
  if (current.length > 0) out.push(current);
  return out;
}

const ExistingSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  address: z.string().nullable(),
  phones: z.array(z.string()).nullable(),
  emails: z.array(z.string()).nullable(),
  websites: z.array(z.string()).nullable(),
  socials: z.record(z.string()).nullable(),
  rating: z.coerce.number().nullable(),
  reviews_count: z.number().nullable(),
  source_2gis_url: z.string().nullable(),
});
export type ExistingBusiness = z.infer<typeof ExistingSchema>;
const EXISTING_COLUMNS = 'id, name, slug, status, address, phones, emails, websites, socials, rating, reviews_count, source_2gis_url';

export type NewBusiness = {
  slug: string; name: string; category: string | null; address: string | null; city: string | null;
  source_2gis_url: string | null; vertical_template_id: string | null; status: 'new' | 'no_contact';
  rating: number | null; reviews_count: number | null; phones: string[]; emails: string[]; websites: string[];
  socials: Record<string, string> | null;
};

// name и slug входят в патч только потому, что bulk-upsert по id требует NOT NULL-колонки; значения — текущие из БД.
export type SafePatch = {
  id: string; name: string; slug: string; rating: number | null; reviews_count: number | null;
  phones: string[]; emails: string[]; websites: string[]; socials: Record<string, string> | null;
  source_2gis_url: string | null; status: string;
};

export type StoreError = { message: string; code?: string };
export type WriteResult = { written: number; error: StoreError | null };

export interface ImportStore {
  loadTemplates(): Promise<Map<string, string>>;
  findExisting(urls: readonly string[], phones: readonly string[]): Promise<ExistingBusiness[]>;
  // Все slug, начинающиеся с одного из roots (root, root-2, ...). Для подбора уникальных slug без N+1.
  loadTakenSlugs(roots: readonly string[]): Promise<Set<string>>;
  // Какие из кандидатов уже заняты: как slug или в slug_history (старые ссылки должны продолжать редиректить).
  findSlugConflicts(candidates: readonly string[]): Promise<Set<string>>;
  insertBatch(rows: readonly NewBusiness[], conflictColumn: 'source_2gis_url' | 'slug'): Promise<WriteResult>;
  updateBatch(rows: readonly SafePatch[]): Promise<WriteResult>;
}

const ROW_LIST = z.array(z.unknown());
const SlugRow = z.object({ slug: z.string(), slug_history: z.array(z.string()).nullable().optional() });
const TemplateRow = z.object({ id: z.string(), slug: z.string() });

function parseList<T>(schema: z.ZodType<T>, data: unknown): T[] {
  const out: T[] = [];
  for (const item of ROW_LIST.catch([]).parse(data)) {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
  }
  return out;
}

function toStoreError(e: { message: string; code?: string } | null): StoreError | null {
  return e ? { message: e.message, code: e.code } : null;
}

// Значения для PostgREST-фильтра в .or(): slug состоит только из a-z0-9-, экранирование не требуется.
const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

export function supabaseImportStore(db: SupabaseClient): ImportStore {
  const businesses = () => db.from('businesses');
  return {
    async loadTemplates() {
      const { data, error } = await db.from('vertical_templates').select('id, slug');
      if (error) throw new Error(`vertical_templates: ${error.message}`);
      return new Map(parseList(TemplateRow, data).map((t) => [t.slug, t.id]));
    },

    async findExisting(urls, phones) {
      const found = new Map<string, ExistingBusiness>();
      const add = (data: unknown) => parseList(ExistingSchema, data).forEach((b) => found.set(b.id, b));
      for (const part of chunkForFilter(urls)) {
        const { data, error } = await businesses().select(EXISTING_COLUMNS).in('source_2gis_url', part);
        if (error) throw new Error(`поиск по 2GIS URL: ${error.message}`);
        add(data);
      }
      for (const part of chunkForFilter(phones)) {
        const { data, error } = await businesses().select(EXISTING_COLUMNS).overlaps('phones', part);
        if (error) throw new Error(`поиск по телефону: ${error.message}`);
        add(data);
      }
      return [...found.values()];
    },

    async loadTakenSlugs(roots) {
      const taken = new Set<string>();
      const safe = [...new Set(roots)].filter((r) => SAFE_SLUG_RE.test(r));
      // В .or() каждый root ещё обёрнут в «slug.like.…*» — делим бюджет пополам.
      for (const part of chunkForFilter(safe, LOOKUP_CHUNK, MAX_FILTER_CHARS / 2)) {
        const { data, error } = await businesses().select('slug').or(part.map((r) => `slug.like.${r}*`).join(','));
        if (error) throw new Error(`slug: ${error.message}`);
        parseList(SlugRow, data).forEach((r) => taken.add(r.slug));
      }
      return taken;
    },

    async findSlugConflicts(candidates) {
      const conflicts = new Set<string>();
      const wanted = new Set(candidates);
      // Список повторяется дважды (slug.in и slug_history.ov) — делим бюджет пополам.
      for (const part of chunkForFilter([...wanted].filter((c) => SAFE_SLUG_RE.test(c)), LOOKUP_CHUNK, MAX_FILTER_CHARS / 2)) {
        const list = part.join(',');
        const { data, error } = await businesses().select('slug, slug_history').or(`slug.in.(${list}),slug_history.ov.{${list}}`);
        if (error) throw new Error(`slug_history: ${error.message}`);
        for (const r of parseList(SlugRow, data)) {
          for (const s of [r.slug, ...(r.slug_history ?? [])]) if (wanted.has(s)) conflicts.add(s);
        }
      }
      return conflicts;
    },

    async insertBatch(rows, conflictColumn) {
      // ON CONFLICT DO NOTHING: параллельный импорт того же файла не создаёт дублей; возвращаются только вставленные.
      const { data, error } = await businesses().upsert([...rows], { onConflict: conflictColumn, ignoreDuplicates: true }).select('id');
      return { written: ROW_LIST.catch([]).parse(data).length, error: toStoreError(error) };
    },

    async updateBatch(rows) {
      const { error } = await businesses().upsert([...rows], { onConflict: 'id' });
      return { written: error ? 0 : rows.length, error: toStoreError(error) };
    },
  };
}

// Хранилище для --dry-run без ключей Supabase: importRows в dry-run к БД не обращается, любой вызов — ошибка.
const offline = (): Promise<never> => Promise.reject(new Error('dry-run: обращение к БД запрещено'));
export const OFFLINE_STORE: ImportStore = {
  loadTemplates: offline, findExisting: offline, loadTakenSlugs: offline, findSlugConflicts: offline,
  insertBatch: offline, updateBatch: offline,
};
