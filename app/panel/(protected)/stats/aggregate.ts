// app/panel/(protected)/stats/aggregate.ts — чистые функции агрегации статистики (ТЗ §13.8). Без БД — покрыты тестами.
// Вход — «тонкие» строки (только нужные колонки), выход — сериализуемый снимок для кэша в settings.

export type BizRow = { id: string; status: string; city: string | null; vertical_template_id: string | null; paid_initial_at: string | null; reply_received_at: string | null };
export type ClientRow = { subscription_price: number | string | null };
export type OutreachRow = { business_id: string; channel: string | null; template_id: string | null; sent_at: string | null; opened_at: string | null; clicked_at: string | null };

export type Count = { key: string; label: string; value: number };
export type TemplateStat = { key: string; label: string; sent: number; opened: number; clicked: number; replied: number; paid: number };
export type DayStat = { day: string; sent: number; paid: number };

export type StatsSnapshot = {
  computed_at: string;
  period_days: number;
  totals: { businesses: number; clients: number; mrr: number; sent: number; paid: number; conversion: number; per_payment: number | null };
  funnel: Count[];
  cities: Count[];
  verticals: Count[];
  channels: Count[];
  templates: TemplateStat[];
  days: DayStat[];
};

export const TOP_CITIES = 30;
export const DAYS_SHOWN = 14;
export const DEFAULT_TEMPLATE = 'default';
const NO_CITY = 'без города';
const NO_VERTICAL = 'без ниши';
const DAY_MS = 86_400_000;

function bump(m: Map<string, number>, k: string, by = 1): void {
  m.set(k, (m.get(k) ?? 0) + by);
}

export function toCounts(m: Map<string, number>, label: (k: string) => string = (k) => k, limit?: number): Count[] {
  const list = [...m.entries()].map(([key, value]) => ({ key, label: label(key), value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'ru'));
  return limit ? list.slice(0, limit) : list;
}

// MRR = сумма subscription_price активных подписок (ТЗ §13.8). numeric из PostgREST приходит строкой.
export function mrr(rows: ClientRow[]): number {
  return rows.reduce((sum, r) => {
    const n = Number(r.subscription_price);
    return Number.isFinite(n) && n > 0 ? sum + n : sum;
  }, 0);
}

// Конверсия sent → paid: доля бизнесов, которым ушло письмо за период и которые оплатили (в процентах, 1 знак).
export function conversion(sentIds: Set<string>, paidIds: Set<string>): { rate: number; perPayment: number | null; paid: number } {
  let paid = 0;
  sentIds.forEach((id) => {
    if (paidIds.has(id)) paid++;
  });
  const rate = sentIds.size ? Math.round((paid / sentIds.size) * 1000) / 10 : 0;
  return { rate, perPayment: paid ? Math.round(sentIds.size / paid) : null, paid };
}

type Names = { verticals: Map<string, string>; templates: Map<string, string>; statusLabel: (s: string) => string };

export function aggregateBusinesses(rows: BizRow[], names: Names) {
  const byStatus = new Map<string, number>();
  const byCity = new Map<string, number>();
  const byVertical = new Map<string, number>();
  const paid = new Set<string>();
  const replied = new Set<string>();
  for (const b of rows) {
    bump(byStatus, b.status);
    bump(byCity, b.city?.trim() || NO_CITY);
    bump(byVertical, b.vertical_template_id ?? NO_VERTICAL);
    if (b.paid_initial_at) paid.add(b.id);
    if (b.reply_received_at) replied.add(b.id);
  }
  return {
    funnel: toCounts(byStatus, names.statusLabel),
    cities: toCounts(byCity, undefined, TOP_CITIES),
    verticals: toCounts(byVertical, (k) => names.verticals.get(k) ?? NO_VERTICAL),
    paid,
    replied,
  };
}

function templateLabel(id: string, templates: Map<string, string>): string {
  if (id === DEFAULT_TEMPLATE) return 'Встроенный';
  return templates.get(id) ?? 'Удалённый шаблон';
}

// Рассылка за период: каналы, шаблоны (с ответами и оплатами), дни. Один проход по строкам.
export function aggregateOutreach(rows: OutreachRow[], ctx: { templates: Map<string, string>; paid: Set<string>; replied: Set<string>; paidAt: Map<string, string>; now: Date }) {
  const byChannel = new Map<string, number>();
  const tpl = new Map<string, { sent: number; opened: number; clicked: number; biz: Set<string> }>();
  const sentIds = new Set<string>();
  const daySent = new Map<string, number>();
  for (const o of rows) {
    if (!o.sent_at) continue;
    sentIds.add(o.business_id);
    bump(byChannel, o.channel || 'email');
    bump(daySent, o.sent_at.slice(0, 10));
    const key = o.template_id || DEFAULT_TEMPLATE;
    const t = tpl.get(key) ?? { sent: 0, opened: 0, clicked: 0, biz: new Set<string>() };
    t.sent++;
    if (o.opened_at) t.opened++;
    if (o.clicked_at) t.clicked++;
    t.biz.add(o.business_id);
    tpl.set(key, t);
  }
  const templates: TemplateStat[] = [...tpl.entries()]
    .map(([key, t]) => {
      let replied = 0;
      let paid = 0;
      t.biz.forEach((id) => {
        if (ctx.replied.has(id)) replied++;
        if (ctx.paid.has(id)) paid++;
      });
      return { key, label: templateLabel(key, ctx.templates), sent: t.sent, opened: t.opened, clicked: t.clicked, replied, paid };
    })
    .sort((a, b) => b.sent - a.sent);
  return { channels: toCounts(byChannel), templates, sentIds, days: lastDays(daySent, ctx.paidAt, ctx.now) };
}

// Последние DAYS_SHOWN дней, включая дни без отправок (нули видны, ряд не «дырявый»).
export function lastDays(daySent: Map<string, number>, paidAt: Map<string, string>, now: Date, days = DAYS_SHOWN): DayStat[] {
  const dayPaid = new Map<string, number>();
  paidAt.forEach((iso) => bump(dayPaid, iso.slice(0, 10)));
  const out: DayStat[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    out.push({ day, sent: daySent.get(day) ?? 0, paid: dayPaid.get(day) ?? 0 });
  }
  return out;
}
