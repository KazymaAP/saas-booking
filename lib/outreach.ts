// lib/outreach.ts — холодная рассылка бизнесам (ТЗ §5.5, §9.2, §9.3, §9.5, §9.8).
// queueApproved: одобренные бизнесы → outreach_log (журнал) + email_queue (очередь, ТЗ §9.2).
// buildEmail: тема, текст, HTML с пикселем, трекингом кликов и ссылкой отписки + заголовки List-Unsubscribe.
// Письмо рендерится в момент постановки в очередь: cron отправляет готовый снимок, повтор не меняет текст.
import { randomUUID } from 'crypto';
import { adminClient } from './supabase';
import { logError } from './log';
import type { Business } from './database.types';
import { SITE_URL as SITE } from './site';
import { renderEmail, substitute, type TemplateVars } from './email-render';

export const DEFAULT_TEMPLATE = {
  subject: 'Сайт онлайн-записи для {name}',
  body:
    'Здравствуйте!\n\nМы подготовили для {name} демо-сайт онлайн-записи: {url}\n\n' +
    'Клиенты смогут записываться с телефона в пару касаний. Если понравится — запустим за 1 день.\n\n' +
    'Ответьте на это письмо, если интересно.',
};

const FOOTER_TEXT = 'Вы получили это письмо, потому что контакты вашей компании опубликованы в открытых справочниках.';
const PREVIEW_TOKEN = 'preview';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Сколько одобренных бизнесов ставится в очередь за одно нажатие (защита от таймаута server action).
const QUEUE_BATCH = 500;
const MAX_TEMPLATES = 100;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Прежний API: подстановка {переменных} без экранирования (только для текста).
// Неизвестные переменные заменяются пустой строкой — как было раньше.
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_w: string, k: string) => vars[k] ?? '');
}

// ===== tracking / unsubscribe URL =====

// base64url без паддинга: безопасно в query-строке (ТЗ §9.3: ?url={base64}).
export function encodeClickTarget(url: string): string {
  return Buffer.from(url, 'utf8').toString('base64url');
}

export function decodeClickTarget(value: string | null): string | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    return decoded || null;
  } catch {
    return null;
  }
}

// Редирект разрешён только на наш домен (точное совпадение origin) — защита от open redirect.
// startsWith использовать нельзя: https://site.ru.evil.com начинается с https://site.ru.
export function safeRedirectTarget(raw: string | null, site: string = SITE): string {
  const fallback = `${site}/`;
  if (!raw) return fallback;
  try {
    const target = new URL(raw, fallback);
    const own = new URL(fallback);
    if (target.origin !== own.origin) return fallback;
    if (target.username || target.password) return fallback;
    return target.toString();
  } catch {
    return fallback;
  }
}

export type TrackingUrls = { pixel: string; click: (url: string) => string; unsubscribePage: string; unsubscribeApi: string };

export function trackingUrls(token: string, site: string = SITE): TrackingUrls {
  const t = encodeURIComponent(token);
  return {
    pixel: `${site}/api/track/open/${t}`,
    click: (url: string) => `${site}/api/track/click/${t}?url=${encodeClickTarget(url)}`,
    unsubscribePage: `${site}/unsubscribe/${t}`,
    unsubscribeApi: `${site}/api/unsubscribe/${t}`,
  };
}

// RFC 2369 + RFC 8058: One-Click POST уходит на URI из List-Unsubscribe, поэтому там API-адрес.
// GET по этому адресу перенаправляет на страницу подтверждения (ТЗ §9.5).
export function unsubscribeHeaders(token: string, site: string = SITE): Record<string, string> {
  return {
    'List-Unsubscribe': `<${trackingUrls(token, site).unsubscribeApi}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

// ===== письмо =====

export type OutreachBusiness = Pick<Business, 'name' | 'city' | 'slug' | 'preview_token' | 'phones' | 'rating' | 'address'>;

export function previewUrl(b: Pick<Business, 'slug' | 'preview_token'>, site: string = SITE): string {
  const token = b.preview_token ? `?token=${encodeURIComponent(b.preview_token)}` : '';
  return `${site}/preview/${encodeURIComponent(b.slug)}${token}`;
}

export function outreachVars(b: OutreachBusiness, verticalName: string | undefined, unsubscribeUrl: string): TemplateVars {
  return {
    name: b.name,
    business_name: b.name,
    city: b.city ?? '',
    url: previewUrl(b),
    phone: b.phones?.[0] ?? '',
    rating: b.rating === null || b.rating === undefined ? '' : String(b.rating),
    vertical_name_lower: (verticalName ?? '').toLowerCase(),
    business_address: b.address ?? '',
    unsubscribe_url: unsubscribeUrl,
  };
}

export type BuiltEmail = { subject: string; text: string; html: string; previewLink: string; headers: Record<string, string> };

export function buildEmail(opts: {
  business: OutreachBusiness;
  trackingToken: string;
  verticalName?: string;
  subject?: string;
  body?: string;
  bodyHtml?: string;
}): BuiltEmail {
  const urls = trackingUrls(opts.trackingToken);
  const vars = outreachVars(opts.business, opts.verticalName, urls.unsubscribePage);
  const tracked = opts.trackingToken !== PREVIEW_TOKEN;
  const rendered = renderEmail(
    { subject: opts.subject ?? DEFAULT_TEMPLATE.subject, body_text: opts.body ?? (opts.bodyHtml ? '' : DEFAULT_TEMPLATE.body), body_html: opts.bodyHtml ?? '' },
    vars,
    {
      preheader: substitute('Демо-сайт онлайн-записи для {name}', vars),
      footerText: FOOTER_TEXT,
      // В предпросмотре трекинг не нужен: ссылки ведут напрямую, пиксель не вставляется.
      pixelUrl: tracked ? urls.pixel : undefined,
      linkRewriter: tracked ? urls.click : undefined,
    },
  );
  const previewLink = tracked ? urls.click(String(vars.url)) : String(vars.url);
  return { ...rendered, previewLink, headers: unsubscribeHeaders(opts.trackingToken) };
}

// ===== выбор шаблона (ТЗ §9.8) =====

export type OutreachTemplate = {
  id: string;
  type: string | null;
  vertical_template_id: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
};

// Явно выбранный → шаблон ниши → outreach_universal → встроенный (null).
export function chooseTemplate(templates: OutreachTemplate[], verticalId: string | null, explicitId?: string): OutreachTemplate | null {
  if (explicitId) {
    const hit = templates.find((t) => t.id === explicitId);
    if (hit) return hit;
  }
  const byVertical = verticalId ? templates.find((t) => t.vertical_template_id === verticalId) : undefined;
  return byVertical ?? templates.find((t) => t.type === 'outreach_universal') ?? null;
}

// ===== постановка в очередь =====

type ApprovedRow = OutreachBusiness & {
  id: string;
  emails: string[] | null;
  vertical_template_id: string | null;
  vertical_templates: { name: string | null } | { name: string | null }[] | null;
};

function verticalNameOf(row: ApprovedRow): string | undefined {
  const v = Array.isArray(row.vertical_templates) ? row.vertical_templates[0] : row.vertical_templates;
  return v?.name ?? undefined;
}

export function primaryEmail(emails: string[] | null | undefined): string | null {
  const first = (emails ?? []).map((e) => e.trim().toLowerCase()).find(Boolean);
  return first ?? null;
}

async function loadOutreachTemplates(): Promise<OutreachTemplate[]> {
  const { data, error } = await adminClient()
    .from('templates').select('id, type, vertical_template_id, subject, body_text, body_html')
    .eq('channel', 'outreach').eq('active', true).limit(MAX_TEMPLATES);
  if (error) throw new Error(`templates: ${error.message}`);
  return (data ?? []) as OutreachTemplate[];
}

// Бизнесы, которым уже писали (идемпотентность), и адреса из списка отписки — одним запросом каждое.
async function exclusions(ids: string[], emails: string[]): Promise<{ contacted: Set<string>; unsubscribed: Set<string> }> {
  const db = adminClient();
  const [logs, unsubs, bounces] = await Promise.all([
    db.from('outreach_log').select('business_id').in('business_id', ids).eq('channel', 'email').limit(ids.length * 2),
    db.from('unsubscribes').select('email').in('email', emails).limit(emails.length),
    // Адреса с hard bounce (нет ящика) — в один список подавления с отписавшимися.
    db.from('email_bounces').select('bounced_email').in('bounced_email', emails).eq('bounce_type', 'hard').limit(emails.length * 2),
  ]);
  if (logs.error) throw new Error(`outreach_log: ${logs.error.message}`);
  if (unsubs.error) throw new Error(`unsubscribes: ${unsubs.error.message}`);
  if (bounces.error) throw new Error(`email_bounces: ${bounces.error.message}`);
  const suppressed = [
    ...(unsubs.data ?? []).map((r: { email: string }) => r.email),
    ...(bounces.data ?? []).map((r: { bounced_email: string | null }) => r.bounced_email ?? ''),
  ];
  return {
    contacted: new Set((logs.data ?? []).map((r: { business_id: string }) => r.business_id)),
    unsubscribed: new Set(suppressed.map((e) => e.toLowerCase()).filter(Boolean)),
  };
}

async function enqueueOne(row: ApprovedRow, to: string, tpl: OutreachTemplate | null): Promise<boolean> {
  const db = adminClient();
  const token = randomUUID();
  const email = buildEmail({
    business: row,
    trackingToken: token,
    verticalName: verticalNameOf(row),
    subject: tpl?.subject ?? undefined,
    body: tpl?.body_text ?? undefined,
    bodyHtml: tpl?.body_html ?? undefined,
  });
  const log = await db.from('outreach_log').insert({
    business_id: row.id, channel: 'email', template_id: tpl?.id ?? null, status: 'queued', tracking_token: token, subject: email.subject,
  });
  if (log.error) {
    await logError('email', `outreach_log insert: ${log.error.message}`, { business: row.id });
    return false;
  }
  const q = await db.from('email_queue').insert({
    business_id: row.id, template_id: tpl?.id ?? null, to_email: to, subject: email.subject,
    body_text: email.text, body_html: email.html, status: 'pending', tracking_token: token, next_retry_at: new Date().toISOString(),
  });
  if (q.error) {
    // Без строки очереди журнал не нужен: откатываем, чтобы бизнес можно было поставить повторно.
    await db.from('outreach_log').delete().eq('tracking_token', token);
    await logError('email', `email_queue insert: ${q.error.message}`, { business: row.id });
    return false;
  }
  return true;
}

// Ставит одобренные бизнесы в очередь. Возвращает число новых писем в очереди.
export async function queueApproved(templateId?: string): Promise<number> {
  const db = adminClient();
  const { data, error } = await db
    .from('businesses').select('id, name, city, slug, preview_token, phones, rating, address, emails, vertical_template_id, vertical_templates(name)')
    .eq('status', 'approved').limit(QUEUE_BATCH);
  if (error) throw new Error(`businesses: ${error.message}`);
  const rows = ((data ?? []) as unknown as ApprovedRow[]).filter((r) => primaryEmail(r.emails));
  if (rows.length === 0) return 0;

  const emails = rows.map((r) => primaryEmail(r.emails) ?? '');
  const [{ contacted, unsubscribed }, templates] = await Promise.all([exclusions(rows.map((r) => r.id), emails), loadOutreachTemplates()]);
  const explicit = templateId && isUuid(templateId) ? templateId : undefined;

  let queued = 0;
  for (const row of rows) {
    const to = primaryEmail(row.emails);
    if (!to || contacted.has(row.id) || unsubscribed.has(to)) continue;
    if (await enqueueOne(row, to, chooseTemplate(templates, row.vertical_template_id, explicit))) queued += 1;
  }
  return queued;
}
