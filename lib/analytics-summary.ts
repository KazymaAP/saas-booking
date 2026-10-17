// lib/analytics-summary.ts — агрегаты для дашборда /panel/stats и API /api/analytics/summary (ТЗ 4.0 §12.3, §13.8).
// Все тяжёлые подсчёты — в Postgres (MV analytics_daily + SQL-функции из 0009_analytics.sql), в Node приходит готовый JSON.
// Результат кэшируется на 60 секунд (unstable_cache): повторные открытия дашборда не нагружают БД.
// Только серверный модуль: использует service_role.
import { unstable_cache } from 'next/cache';
import { z } from 'zod';
import { adminClient } from './supabase';

export const SUMMARY_CACHE_SECONDS = 60;
export const MAX_RANGE_DAYS = 366;
export const DEFAULT_RANGE_DAYS = 30;
const DAY_MS = 86_400_000;

export const GROUP_BY = ['day', 'week', 'month'] as const;
export type GroupBy = (typeof GROUP_BY)[number];

const KeyValue = z.object({ key: z.string(), value: z.coerce.number() });
const SeriesPoint = z.object({
  bucket: z.string(),
  pageviews: z.coerce.number(),
  sessions: z.coerce.number(),
  visitors: z.coerce.number(),
  booking_open: z.coerce.number(),
  booking_submit: z.coerce.number(),
  phone_click: z.coerce.number(),
  map_open: z.coerce.number(),
  bookings: z.coerce.number(),
});
const TemplateRow = z.object({ key: z.string(), sent: z.coerce.number(), opened: z.coerce.number(), clicked: z.coerce.number() });
const TopBusiness = z.object({ business_id: z.string(), name: z.string(), pageviews: z.coerce.number(), bookings: z.coerce.number() });

const BusinessSummary = z.object({
  total: z.coerce.number(),
  mrr: z.coerce.number(),
  active_subscriptions: z.coerce.number(),
  // Конверсия sent → paid: бизнесы, которым ушла рассылка, и из них оплатившие (ТЗ §13.8).
  contacted: z.coerce.number(),
  paid: z.coerce.number(),
  paid_total: z.coerce.number(),
  by_status: z.record(z.coerce.number()),
  by_city: z.array(KeyValue),
  by_vertical: z.array(KeyValue),
});
const OutreachSummary = z.object({
  by_channel: z.array(KeyValue),
  by_template: z.array(TemplateRow),
  by_day: z.array(KeyValue),
});
const TrafficSummary = z.object({
  by_event: z.record(z.coerce.number()),
  top_businesses: z.array(TopBusiness),
});

export type SeriesPoint = z.infer<typeof SeriesPoint>;
export type BusinessSummary = z.infer<typeof BusinessSummary>;
export type OutreachSummary = z.infer<typeof OutreachSummary>;
export type TrafficSummary = z.infer<typeof TrafficSummary>;

export type SummaryParams = { business_id: string | null; from: string; to: string; group_by: GroupBy };

export type Totals = { pageviews: number; sessions: number; visitors: number; bookings: number; view_to_booking: number };

// MV analytics_daily обновляется cron раз в час; если cron не настроен — лениво, не чаще раза в час.
const MV_MAX_AGE = '1 hour';

export type AnalyticsSummary = {
  params: SummaryParams;
  generated_at: string;
  // Момент последнего обновления MV analytics_daily: трафик на дашборде актуален на это время.
  data_as_of: string | null;
  totals: Totals;
  series: SeriesPoint[];
  traffic: TrafficSummary;
  // Платформенные срезы (воронка, MRR, рассылка) — только для общего отчёта супер-админа (business_id = null).
  business: BusinessSummary | null;
  outreach: OutreachSummary | null;
};

// Календарная дата YYYY-MM-DD. Date.parse принимает 2026-02-30 (переносит на март), Postgres — нет (→ 500),
// поэтому сверяем обратное преобразование.
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
});

const ParamsSchema = z.object({
  business_id: z.string().uuid().nullable(),
  from: IsoDate,
  to: IsoDate,
  group_by: z.enum(GROUP_BY),
});

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Разбор и нормализация параметров: to — исключающая граница; по умолчанию последние 30 дней.
export function parseSummaryParams(input: Record<string, string | null | undefined>, now: Date = new Date()):
  { ok: true; params: SummaryParams } | { ok: false; error: string } {
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const to = input.to || isoDay(tomorrow);
  const from = input.from || isoDay(new Date(Date.parse(`${to}T00:00:00Z`) - DEFAULT_RANGE_DAYS * DAY_MS));
  const parsed = ParamsSchema.safeParse({
    business_id: input.business_id || null,
    from,
    to,
    group_by: input.group_by || 'day',
  });
  if (!parsed.success) return { ok: false, error: 'invalid_params' };
  const span = (Date.parse(`${parsed.data.to}T00:00:00Z`) - Date.parse(`${parsed.data.from}T00:00:00Z`)) / DAY_MS;
  if (!Number.isFinite(span) || span <= 0) return { ok: false, error: 'invalid_range' };
  if (span > MAX_RANGE_DAYS) return { ok: false, error: 'range_too_large' };
  return { ok: true, params: parsed.data };
}

// Процент с одной цифрой после запятой; при нулевом знаменателе — 0 (а не NaN/Infinity).
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export function computeTotals(series: SeriesPoint[]): Totals {
  const sum = (k: keyof Omit<SeriesPoint, 'bucket'>) => series.reduce((acc, p) => acc + p[k], 0);
  const pageviews = sum('pageviews');
  const bookings = sum('bookings');
  return {
    pageviews,
    sessions: sum('sessions'),
    visitors: sum('visitors'),
    bookings,
    // Конверсия просмотр → заявка, %, одна цифра после запятой.
    view_to_booking: percent(bookings, pageviews),
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await adminClient().rpc(fn, args);
  if (error) throw new Error(`rpc ${fn}: ${error.code ?? 'error'}`);
  return schema.parse(data);
}

// Возвращает время последнего refresh. Ошибка обновления не роняет отчёт: показываем то, что уже есть в MV.
async function ensureFreshDaily(): Promise<string | null> {
  const { data, error } = await adminClient().rpc('analytics_refresh_if_stale', { p_max_age: MV_MAX_AGE });
  if (error) return null;
  return typeof data === 'string' ? data : null;
}

async function loadSummaryUncached(params: SummaryParams): Promise<AnalyticsSummary> {
  const data_as_of = await ensureFreshDaily();
  const scope = { p_from: params.from, p_to: params.to, p_business_id: params.business_id };
  const platform = params.business_id === null;
  const [series, traffic, business, outreach] = await Promise.all([
    rpc('analytics_series', { ...scope, p_group: params.group_by }, z.array(SeriesPoint)),
    rpc('analytics_traffic_summary', scope, TrafficSummary),
    platform ? rpc('analytics_business_summary', {}, BusinessSummary) : Promise.resolve(null),
    platform
      ? rpc('analytics_outreach_summary', { p_from: `${params.from}T00:00:00+03:00`, p_to: `${params.to}T00:00:00+03:00` }, OutreachSummary)
      : Promise.resolve(null),
  ]);
  return { params, generated_at: new Date().toISOString(), data_as_of, totals: computeTotals(series), series, traffic, business, outreach };
}

// Ключ кэша — сами параметры (unstable_cache сериализует аргументы). Права проверяются ДО вызова.
export const loadSummary = unstable_cache(loadSummaryUncached, ['analytics-summary'], {
  revalidate: SUMMARY_CACHE_SECONDS,
  tags: ['analytics-summary'],
});
