// lib/generate.ts — генератор прототипов (ТЗ §11.3, §11.4; шаг 2 воронки §13.2).
// Шаги: уникальный slug → услуги из шаблона ниши → логотип (og:image через SSRF-safe fetch, иначе SVG с инициалами)
// → фото из og:image → favicon → preview_url/preview_token → status='preview_ready', generation_status='done'.
// Ошибка — до 3 попыток; после третьей — SVG-заглушка и generation_status='needs_retry'.
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { Business, VerticalTemplate } from './database.types';
import { fetchOgImage, type OgOptions } from './generate-og';
import { supabaseGenerateStore, type BusinessPatch, type GenerateStore, type ServiceRow } from './generate-store';
import { DEFAULT_ATTEMPTS, mapLimit, withRetry, type RetryOptions } from './retry';
import { SITE_URL } from './site';
import { ensureUniqueSlug } from './slug';
import { adminClient } from './supabase';

export { extractOgImage, fetchOgImage } from './generate-og';

export const GENERATE_ATTEMPTS = DEFAULT_ATTEMPTS;
export const GENERATE_CONCURRENCY = 5;
export const DEFAULT_COLOR = '#111111';
const MAX_ERROR_LENGTH = 500;
const MAX_SERVICES = 50;
const LOGO_SIZE = 128;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Шаблон приходит из jsonb — проверяем, чтобы мусор в default_services не уронил вставку услуг.
const TemplateServiceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  price: z.coerce.number().min(0).max(10_000_000),
  duration: z.coerce.number().int().min(5).max(24 * 60),
});

// Бизнес с колонкой счётчика попыток (§4.6). В lib/database.types.ts её пока нет — зона агента 1.
export type GeneratableBusiness = Business & { generation_attempts?: number | null };

export type GenerateDeps = {
  store?: GenerateStore;
  og?: OgOptions;
  retry?: RetryOptions;
  uuid?: () => string;
  siteUrl?: string;
};

// Цвет попадает в SVG и CSS — только валидный hex, иначе дефолт (защита от инъекции в атрибут).
export function safeColor(...candidates: ReadonlyArray<string | null | undefined>): string {
  return candidates.find((c): c is string => typeof c === 'string' && HEX_COLOR_RE.test(c)) ?? DEFAULT_COLOR;
}

const escapeXml = (s: string): string =>
  s.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch] ?? ch);

export function initials(name: string): string {
  // Кавычки и знаки («Шина», "Колесо") не должны становиться инициалами.
  const words = name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  return words.slice(0, 2).map((w) => [...w][0].toUpperCase()).join('') || '?';
}

export function initialsLogo(name: string, color: string): string {
  const fill = safeColor(color);
  const text = escapeXml(initials(name));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_SIZE}" height="${LOGO_SIZE}" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}"><rect width="${LOGO_SIZE}" height="${LOGO_SIZE}" rx="24" fill="${fill}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-size="56" fill="#ffffff">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function templateServices(businessId: string, template: VerticalTemplate | null): ServiceRow[] {
  const rows: ServiceRow[] = [];
  for (const raw of (template?.default_services ?? []).slice(0, MAX_SERVICES)) {
    const s = TemplateServiceSchema.safeParse(raw);
    if (!s.success) continue;
    rows.push({ business_id: businessId, name: s.data.name, price: s.data.price, duration_minutes: s.data.duration, sort_order: rows.length + 1, is_active: true });
  }
  return rows;
}

export function previewUrl(siteUrl: string, slug: string, token: string): string {
  return `${siteUrl.replace(/\/$/, '')}/preview/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`;
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : 'неизвестная ошибка').slice(0, MAX_ERROR_LENGTH);

// Одна попытка генерации. Повторный запуск безопасен: услуги и фото не дублируются, токен сохраняется.
async function generateOnce(business: GeneratableBusiness, template: VerticalTemplate | null, store: GenerateStore, deps: GenerateDeps): Promise<{ url: string; patch: BusinessPatch }> {
  const slug = await ensureUniqueSlug(business.slug || business.name, (candidate) => store.slugTaken(candidate, business.id));
  // Токен не меняем при повторной генерации: ссылка в уже отправленном письме должна продолжать работать.
  const token = business.preview_token && UUID_RE.test(business.preview_token) ? business.preview_token : (deps.uuid ?? randomUUID)();
  const color = safeColor(business.brand_color, template?.default_colors?.primary);

  const [serviceCount, ogImage] = await Promise.all([
    store.countServices(business.id),
    business.logo_url ? Promise.resolve(null) : fetchOgImage(business.websites?.[0], deps.og),
  ]);
  const services = templateServices(business.id, template);
  if (serviceCount === 0 && services.length > 0) await store.insertServices(services);
  if (ogImage && (await store.countPhotos(business.id)) === 0) {
    await store.insertPhoto({ business_id: business.id, url: ogImage, alt: business.name, sort_order: 1 });
  }

  const logo = business.logo_url ?? ogImage ?? initialsLogo(business.name, color);
  const url = previewUrl(deps.siteUrl ?? SITE_URL, slug, token);
  return {
    url,
    patch: {
      slug, logo_url: logo, favicon_url: business.favicon_url ?? logo, brand_color: color, preview_token: token,
      preview_url: url, status: 'preview_ready', generation_status: 'done', generation_error: null,
    },
  };
}

// Генерирует прототип одного бизнеса и возвращает ссылку. Бросает ошибку после исчерпания попыток.
export async function generatePrototype(business: GeneratableBusiness, template: VerticalTemplate | null, deps: GenerateDeps = {}): Promise<string> {
  const store = deps.store ?? supabaseGenerateStore(adminClient());
  const prevAttempts = business.generation_attempts ?? 0;
  let used = 0;
  try {
    return await withRetry(async (attempt) => {
      used = attempt;
      try {
        const { url, patch } = await generateOnce(business, template, store, deps);
        await store.updateBusiness(business.id, { ...patch, generation_attempts: prevAttempts + attempt });
        return url;
      } catch (e) {
        // §11.4: каждая неудача видна в админке сразу (failed + текст), а не только после третьей попытки.
        await markAttemptFailed(store, business.id, prevAttempts + attempt, e);
        throw e;
      }
    }, { attempts: GENERATE_ATTEMPTS, ...deps.retry });
  } catch (e) {
    await markFailed(business, template, store, prevAttempts + used, e);
    throw e;
  }
}

async function markAttemptFailed(store: GenerateStore, id: string, attempts: number, e: unknown): Promise<void> {
  await store.updateBusiness(id, { generation_status: 'failed', generation_error: errorText(e), generation_attempts: attempts })
    .catch(() => undefined); // БД недоступна — следующая попытка или markFailed запишут статус.
}

// После всех попыток: SVG-заглушка (если логотипа нет) и needs_retry — бизнес остаётся на шаге 2 воронки.
async function markFailed(business: GeneratableBusiness, template: VerticalTemplate | null, store: GenerateStore, attempts: number, e: unknown): Promise<void> {
  const color = safeColor(business.brand_color, template?.default_colors?.primary);
  const logo = business.logo_url ?? initialsLogo(business.name, color);
  await store.updateBusiness(business.id, {
    logo_url: logo, favicon_url: business.favicon_url ?? logo,
    generation_status: 'needs_retry', generation_error: errorText(e), generation_attempts: attempts,
  }).catch(() => undefined); // БД недоступна — исходная ошибка важнее, её получит вызывающий.
}

export type GenerateResult = { id: string; ok: true; url: string } | { id: string; ok: false; error: string };

// Пакетная генерация: не больше 5 одновременно (ТЗ: «батчами по 5»). Ошибка одного не останавливает остальных.
export async function generateMany(
  items: ReadonlyArray<{ business: GeneratableBusiness; template: VerticalTemplate | null }>,
  deps: GenerateDeps = {},
  concurrency: number = GENERATE_CONCURRENCY,
): Promise<GenerateResult[]> {
  const shared: GenerateDeps = { ...deps, store: deps.store ?? supabaseGenerateStore(adminClient()) };
  return mapLimit(items, concurrency, async ({ business, template }): Promise<GenerateResult> => {
    try {
      return { id: business.id, ok: true, url: await generatePrototype(business, template, shared) };
    } catch (e) {
      return { id: business.id, ok: false, error: errorText(e) };
    }
  });
}
