// lib/legacy-apply.ts — запись legacy-клиентов: upsert по slug пачками по 100 с retry, редиректы старых доменов.
// Существующий бизнес: name/city/подписка из CSV, телефоны и email дописываются (не затираются), ниша не меняется.
// Новый: статус client, ниша из колонки vertical или tire-service (исторически все legacy — шиномонтажи).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { LegacyRecord } from './legacy-csv';
import { chunk, withRetry, type RetryOptions } from './retry';

export const LEGACY_BATCH = 100;
export const DEFAULT_LEGACY_VERTICAL = 'tire-service';

export type LegacyExisting = { id: string; slug: string; phones: string[]; emails: string[]; vertical_template_id: string | null };

// Без id: upsert идёт по slug, а разный набор ключей в пачке supabase-js дополнил бы NULL-ами (id NOT NULL).
export type LegacyRow = {
  slug: string; name: string; city: string | null; phones: string[]; emails: string[]; status: 'client';
  subscription_active: boolean; subscription_until: string | null; vertical_template_id: string | null;
};

export interface LegacyStore {
  templates(): Promise<Map<string, string>>;
  existing(slugs: readonly string[]): Promise<LegacyExisting[]>;
  upsertBusinesses(rows: readonly LegacyRow[]): Promise<void>;
  upsertRedirects(rows: ReadonlyArray<{ from_domain: string; to_url: string }>): Promise<void>;
}

export type LegacyStats = { created: number; updated: number; redirects: number; errors: string[] };

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

// Активна ли подписка на сегодня (дата в CSV — последний оплаченный день включительно).
export function isActive(until: string | null, today: string): boolean {
  return until !== null && until >= today;
}

export function buildRows(records: readonly LegacyRecord[], existing: ReadonlyMap<string, LegacyExisting>, templates: ReadonlyMap<string, string>, today: string): { rows: LegacyRow[]; created: number } {
  let created = 0;
  const rows = records.map((r): LegacyRow => {
    const hit = existing.get(r.slug);
    if (!hit) created++;
    return {
      slug: r.slug, name: r.name, city: r.city,
      phones: union(hit?.phones ?? [], r.phones), emails: union(hit?.emails ?? [], r.emails),
      status: 'client', subscription_active: isActive(r.subscription_until, today), subscription_until: r.subscription_until,
      vertical_template_id: hit ? hit.vertical_template_id : templates.get(r.vertical ?? DEFAULT_LEGACY_VERTICAL) ?? null,
    };
  });
  return { rows, created };
}

const message = (e: unknown): string => (e instanceof Error ? e.message : 'ошибка');

export async function applyLegacy(store: LegacyStore, records: readonly LegacyRecord[], today: string, retry: RetryOptions = {}): Promise<LegacyStats> {
  const stats: LegacyStats = { created: 0, updated: 0, redirects: 0, errors: [] };
  const templates = await withRetry(() => store.templates(), retry);
  for (const part of chunk(records, LEGACY_BATCH)) {
    try {
      const found = await withRetry(() => store.existing(part.map((r) => r.slug)), retry);
      const { rows, created } = buildRows(part, new Map(found.map((b) => [b.slug, b])), templates, today);
      await withRetry(() => store.upsertBusinesses(rows), retry);
      stats.created += created;
      stats.updated += rows.length - created;
      const redirects = part.flatMap((r) => (r.redirect ? [r.redirect] : []));
      if (redirects.length > 0) {
        await withRetry(() => store.upsertRedirects(redirects), retry);
        stats.redirects += redirects.length;
      }
    } catch (e) {
      stats.errors.push(`Пачка ${part[0].slug}…${part[part.length - 1].slug}: ${message(e)}`);
    }
  }
  return stats;
}

const ExistingRow = z.object({
  id: z.string(), slug: z.string(),
  phones: z.array(z.string()).nullable().transform((v) => v ?? []),
  emails: z.array(z.string()).nullable().transform((v) => v ?? []),
  vertical_template_id: z.string().nullable(),
});
const TemplateRow = z.object({ id: z.string(), slug: z.string() });

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export function supabaseLegacyStore(db: SupabaseClient): LegacyStore {
  return {
    async templates() {
      const { data, error } = await db.from('vertical_templates').select('id, slug');
      check(error, 'vertical_templates');
      return new Map(z.array(TemplateRow).parse(data ?? []).map((t) => [t.slug, t.id]));
    },
    async existing(slugs) {
      const { data, error } = await db.from('businesses').select('id, slug, phones, emails, vertical_template_id').in('slug', [...slugs]);
      check(error, 'поиск по slug');
      return z.array(ExistingRow).parse(data ?? []);
    },
    async upsertBusinesses(rows) {
      // ON CONFLICT (slug): повторный запуск того же CSV обновляет, а не дублирует.
      const { error } = await db.from('businesses').upsert([...rows], { onConflict: 'slug' });
      check(error, 'upsert businesses');
    },
    async upsertRedirects(rows) {
      const { error } = await db.from('legacy_redirects').upsert([...rows], { onConflict: 'from_domain' });
      check(error, 'upsert legacy_redirects');
    },
  };
}
