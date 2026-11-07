// lib/generate-store.ts — доступ к БД для генератора прототипов. Отделён от логики, чтобы её покрыть тестами без Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidSlug } from './slug';

export type GenerationStatus = 'pending' | 'done' | 'failed' | 'needs_retry';

export type ServiceRow = {
  business_id: string; name: string; price: number; duration_minutes: number; sort_order: number; is_active: boolean;
};
export type PhotoRow = { business_id: string; url: string; alt: string; sort_order: number };

export type BusinessPatch = {
  slug?: string; logo_url?: string; favicon_url?: string; brand_color?: string; preview_token?: string;
  preview_url?: string; status?: 'preview_ready';
  generation_status?: GenerationStatus; generation_error?: string | null; generation_attempts?: number;
};

export interface GenerateStore {
  // true — slug занят другим бизнесом (как текущий slug или в slug_history: старые ссылки продолжают редиректить).
  slugTaken(candidate: string, excludeId: string): Promise<boolean>;
  countServices(businessId: string): Promise<number>;
  insertServices(rows: readonly ServiceRow[]): Promise<void>;
  countPhotos(businessId: string): Promise<number>;
  insertPhoto(row: PhotoRow): Promise<void>;
  updateBusiness(id: string, patch: BusinessPatch): Promise<void>;
}

// Колонок generation_* нет, пока не применена 0003_seed.sql (PostgREST: PGRST204, Postgres: 42703).
const MISSING_COLUMN_CODES: ReadonlySet<string> = new Set(['PGRST204', '42703']);
const GENERATION_KEYS = ['generation_status', 'generation_error', 'generation_attempts'] as const;

type DbError = { message: string; code?: string } | null;

function check(error: DbError, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

function withoutGenerationFields(patch: BusinessPatch): BusinessPatch {
  const copy: BusinessPatch = { ...patch };
  for (const key of GENERATION_KEYS) delete copy[key];
  return copy;
}

export function supabaseGenerateStore(db: SupabaseClient): GenerateStore {
  return {
    async slugTaken(candidate, excludeId) {
      // В .or() значение не экранируется — допускаем только корректный slug (a-z0-9-).
      if (!isValidSlug(candidate)) return true;
      const { data, error } = await db
        .from('businesses').select('id')
        .or(`slug.eq.${candidate},slug_history.cs.{${candidate}}`)
        .neq('id', excludeId)
        .limit(1);
      check(error, 'проверка slug');
      return (data?.length ?? 0) > 0;
    },

    async countServices(businessId) {
      const { count, error } = await db.from('services').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
      check(error, 'услуги');
      return count ?? 0;
    },

    async insertServices(rows) {
      const { error } = await db.from('services').insert([...rows]);
      check(error, 'вставка услуг');
    },

    async countPhotos(businessId) {
      const { count, error } = await db.from('photos').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
      check(error, 'фото');
      return count ?? 0;
    },

    async insertPhoto(row) {
      const { error } = await db.from('photos').insert(row);
      check(error, 'вставка фото');
    },

    async updateBusiness(id, patch) {
      const { error } = await db.from('businesses').update(patch).eq('id', id);
      if (error?.code && MISSING_COLUMN_CODES.has(error.code)) {
        // Миграция с generation_* ещё не применена — сохраняем основное, статус генерации пропускаем.
        const retry = await db.from('businesses').update(withoutGenerationFields(patch)).eq('id', id);
        check(retry.error, 'обновление бизнеса');
        return;
      }
      check(error, 'обновление бизнеса');
    },
  };
}
