// app/panel/(protected)/stats/compute.ts — расчёт и кэш статистики (ТЗ §13.8, промт: «кэш для stats, не тяжёлый SQL каждый раз»).
// ▸ Снимок считается не чаще раза в CACHE_TTL_MS и хранится в settings (ключ stats_cache_<период>).
//   Materialized view — зона агента 1 (миграции), предложение SQL — в notes.md.
// ▸ Чтение постранично по PAGE_ROWS: PostgREST отдаёт не больше 1000 строк за запрос — раньше .limit(50000)
//   молча обрезался до 1000 и статистика была неверной.
// ▸ Рассылка — только за выбранный период (при росте нужен индекс outreach_log(sent_at) — см. notes.md).
// Модуль только серверный: импортируется из Server Component и server action (adminClient = service_role).
import { adminClient } from '@/lib/supabase';
import { rowsOf } from '../_lib/db';
import { statusLabel } from '../_lib/statuses';
import { aggregateBusinesses, aggregateOutreach, conversion, mrr, type BizRow, type ClientRow, type OutreachRow, type StatsSnapshot } from './aggregate';

export const PERIODS = [30, 90, 365] as const;
export type Period = (typeof PERIODS)[number];
export const CACHE_TTL_MS = 15 * 60_000;
const PAGE_ROWS = 1000;
// Предохранитель от бесконечного цикла при ошибке пагинации: 200 страниц = 200 000 строк.
const MAX_PAGES = 200;
const DAY_MS = 86_400_000;

export function cacheKey(period: Period): string {
  return `stats_cache_${period}`;
}

type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

// Читает все строки запроса страницами. Ошибка любой страницы — исключение (снимок не сохраняется частичным).
export async function fetchAll<T>(page: Page<T>, pageRows = PAGE_ROWS): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * pageRows, (i + 1) * pageRows - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageRows) break;
  }
  return out;
}

async function loadRaw(period: Period, now: Date) {
  const db = adminClient();
  const since = new Date(now.getTime() - period * DAY_MS).toISOString();
  const [biz, clients, outreach, verticals, templates] = await Promise.all([
    fetchAll<BizRow>((a, b) => db.from('businesses').select('id, status, city, vertical_template_id, paid_initial_at, reply_received_at').neq('status', 'deleted').order('id').range(a, b).returns<BizRow[]>()),
    fetchAll<ClientRow>((a, b) => db.from('businesses').select('subscription_price').eq('status', 'client').eq('subscription_active', true).order('id').range(a, b).returns<ClientRow[]>()),
    fetchAll<OutreachRow>((a, b) => db.from('outreach_log').select('business_id, channel, template_id, sent_at, opened_at, clicked_at').gte('sent_at', since).order('id').range(a, b).returns<OutreachRow[]>()),
    db.from('vertical_templates').select('id, name').returns<{ id: string; name: string }[]>(),
    db.from('templates').select('id, name').returns<{ id: string; name: string | null }[]>(),
  ]);
  return {
    biz,
    clients,
    outreach,
    // Сбой справочника — исключение: иначе снимок с безымянными нишами/шаблонами попал бы в кэш на CACHE_TTL_MS.
    verticals: new Map(rowsOf(verticals).map((v) => [v.id, v.name])),
    templates: new Map(rowsOf(templates).map((t) => [t.id, t.name || 'Без названия'])),
  };
}

export async function computeStats(period: Period, now: Date = new Date()): Promise<StatsSnapshot> {
  const raw = await loadRaw(period, now);
  const b = aggregateBusinesses(raw.biz, { verticals: raw.verticals, templates: raw.templates, statusLabel });
  const paidAt = new Map<string, string>();
  const since = now.getTime() - period * DAY_MS;
  for (const r of raw.biz) if (r.paid_initial_at && new Date(r.paid_initial_at).getTime() >= since) paidAt.set(r.id, r.paid_initial_at);
  const o = aggregateOutreach(raw.outreach, { templates: raw.templates, paid: b.paid, replied: b.replied, paidAt, now });
  const conv = conversion(o.sentIds, b.paid);
  return {
    computed_at: now.toISOString(),
    period_days: period,
    totals: {
      businesses: raw.biz.length,
      clients: b.funnel.find((c) => c.key === 'client')?.value ?? 0,
      mrr: mrr(raw.clients),
      sent: o.sentIds.size,
      paid: conv.paid,
      conversion: conv.rate,
      per_payment: conv.perPayment,
    },
    funnel: b.funnel,
    cities: b.cities,
    verticals: b.verticals,
    channels: o.channels,
    templates: o.templates,
    days: o.days,
  };
}

function isSnapshot(v: unknown): v is StatsSnapshot {
  return typeof v === 'object' && v !== null && 'computed_at' in v && 'totals' in v && 'funnel' in v;
}

// Снимок из кэша, если он свежее TTL; иначе пересчёт и запись. force — кнопка «Пересчитать».
export async function getStats(period: Period, force = false): Promise<{ snapshot: StatsSnapshot; cached: boolean }> {
  const db = adminClient();
  if (!force) {
    // Сбой чтения кэша не фатален: data=null → честный пересчёт из исходных таблиц (сбой там уже бросит исключение).
    const { data } = await db.from('settings').select('value').eq('key', cacheKey(period)).maybeSingle<{ value: unknown }>();
    const v = data?.value;
    if (isSnapshot(v) && Date.now() - new Date(v.computed_at).getTime() < CACHE_TTL_MS) return { snapshot: v, cached: true };
  }
  const snapshot = await computeStats(period);
  // Ошибка записи кэша не мешает показать свежие данные.
  await db.from('settings').upsert({ key: cacheKey(period), value: snapshot, updated_at: snapshot.computed_at });
  return { snapshot, cached: false };
}
