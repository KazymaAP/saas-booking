// lib/outreach.ts — очередь рассылки и рендер писем (ТЗ §5.5, шаг 4 воронки).
import { randomBytes } from 'crypto';
import { adminClient } from './supabase';
import type { Business } from './database.types';
import { SITE_URL as SITE } from './site';

export const DEFAULT_TEMPLATE = {
  subject: 'Сайт онлайн-записи для {name}',
  body:
    'Здравствуйте!\n\nМы подготовили для {name} демо-сайт онлайн-записи: {url}\n\n' +
    'Клиенты смогут записываться с телефона в пару касаний. Если понравится — запустим за 1 день.\n\n' +
    'Ответьте на это письмо, если интересно.',
};

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// Ставит одобренные бизнесы в очередь: outreach_log со статусом queued и токеном трекинга.
export async function queueApproved(templateId?: string): Promise<number> {
  const db = adminClient();
  const { data: businesses } = await db
    .from('businesses').select('id, emails').eq('status', 'approved');
  let queued = 0;
  for (const b of (businesses ?? []) as Pick<Business, 'id' | 'emails'>[]) {
    if (!b.emails?.length) continue;
    const { data: existing } = await db.from('outreach_log').select('id').eq('business_id', b.id).limit(1);
    if (existing?.length) continue;
    await db.from('outreach_log').insert({
      business_id: b.id,
      channel: 'email',
      template_id: templateId ?? 'default',
      status: 'queued',
      tracking_token: randomBytes(16).toString('hex'),
    });
    queued++;
  }
  return queued;
}

// Письмо с пикселем открытия и ссылкой-трекером (§5.5).
export function buildEmail(opts: {
  business: Business & { vertical_templates?: { name?: string } | null };
  trackingToken: string;
  verticalName?: string;
  subject?: string;
  body?: string;
}) {
  const b = opts.business;
  const vars = {
    name: b.name,
    city: b.city ?? '',
    url: `${SITE}/preview/${b.slug}?token=${b.preview_token}`,
    phone: b.phones?.[0] ?? '',
    rating: b.rating ? String(b.rating) : '',
    vertical_name_lower: opts.verticalName ?? '',
  };
  const subject = renderTemplate(opts.subject ?? DEFAULT_TEMPLATE.subject, vars);
  const text = renderTemplate(opts.body ?? DEFAULT_TEMPLATE.body, vars);
  const clickUrl = `${SITE}/api/track/click/${opts.trackingToken}?to=${encodeURIComponent(vars.url)}`;
  const pixel = `<img src="${SITE}/api/track/open/${opts.trackingToken}" width="1" height="1" alt="" />`;
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">` +
    text.split('\n').map((l) => (l ? `<p>${escapeHtml(l)}</p>` : '')).join('') +
    `<p><a href="${clickUrl}" style="color:#111111">Открыть демо</a></p>${pixel}</div>`;
  return { subject, text, html, previewLink: clickUrl };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
