// lib/email-render.ts — единый рендер писем: тема, текст, HTML с inline-CSS (ТЗ §0.4, §9.7–9.9).
// Чистые функции без обращения к БД: шаблон приходит строкой из templates, переменные — объектом.
// Безопасность: в HTML значения экранируются, в теме удаляются переводы строк (защита от header injection).

// Полный список переменных шаблонов (ТЗ §9.9).
export const TEMPLATE_VARIABLES = [
  'name', 'city', 'url', 'phone', 'rating', 'vertical_name_lower', 'business_name', 'client_name',
  'service_name', 'scheduled_at_local', 'business_address', 'cancel_url', 'reschedule_url', 'panel_url',
  'email', 'password', 'support_until', 'download_url', 'unsubscribe_url',
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateVars = Partial<Record<TemplateVariable, string | number | null | undefined>>;

export type EmailTemplateSource = {
  subject: string | null | undefined;
  body_text?: string | null;
  body_html?: string | null;
};

export type RenderedEmail = { subject: string; text: string; html: string };

export type RenderOptions = {
  // Скрытый текст-превью в списке писем почтового клиента.
  preheader?: string;
  // Подпись под письмом (обычный текст).
  footerText?: string;
  // Пиксель открытия, вставляется перед </body>.
  pixelUrl?: string;
  // Переписывает ссылки http(s) в HTML (трекинг кликов).
  linkRewriter?: (url: string) => string;
};

// ТЗ §9.1: лимит размера письма 500 КБ.
export const MAX_EMAIL_BYTES = 500 * 1024;
const MAX_SUBJECT_LENGTH = 200;
const PLACEHOLDER = /\{([a-z_]+)\}/g;
const KNOWN = new Set<string>(TEMPLATE_VARIABLES);

export class EmailTooLargeError extends Error {}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

function stringify(value: TemplateVars[TemplateVariable]): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

// Подстановка переменных. Известная переменная без значения → пустая строка;
// неизвестный плейсхолдер ({foo}) остаётся как есть — это текст автора шаблона, а не переменная.
export function substitute(template: string, vars: TemplateVars, encode: (s: string) => string = (s) => s): string {
  return template.replace(PLACEHOLDER, (whole: string, key: string) => {
    if (!KNOWN.has(key)) return whole;
    return encode(stringify(vars[key as TemplateVariable]));
  });
}

// Тема: одна строка, без управляющих символов, не длиннее 200 символов.
export function renderSubject(template: string, vars: TemplateVars): string {
  const raw = substitute(template, vars);
  // eslint-disable-next-line no-control-regex
  const oneLine = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return oneLine.slice(0, MAX_SUBJECT_LENGTH);
}

export function renderText(template: string, vars: TemplateVars): string {
  return substitute(template, vars).replace(/\r\n?/g, '\n');
}

// Список переменных, использованных в шаблоне, и список неизвестных плейсхолдеров.
export function extractVariables(template: string): { known: TemplateVariable[]; unknown: string[] } {
  const known = new Set<TemplateVariable>();
  const unknown = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) {
    if (KNOWN.has(m[1])) known.add(m[1] as TemplateVariable);
    else unknown.add(m[1]);
  }
  return { known: [...known], unknown: [...unknown] };
}

// ===== inline CSS =====
// Почтовые клиенты (Gmail, Outlook, Яндекс) режут <style>, поэтому стили пишутся в атрибут style.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
export const INLINE_STYLES: Readonly<Record<string, string>> = {
  p: 'margin:0 0 16px 0;font-size:16px;line-height:1.5;color:#111111',
  a: 'color:#111111;text-decoration:underline',
  h1: 'margin:0 0 16px 0;font-size:22px;line-height:1.3;font-weight:600;color:#111111',
  h2: 'margin:0 0 12px 0;font-size:18px;line-height:1.3;font-weight:600;color:#111111',
  ul: 'margin:0 0 16px 0;padding:0 0 0 20px',
  ol: 'margin:0 0 16px 0;padding:0 0 0 20px',
  li: 'margin:0 0 8px 0;font-size:16px;line-height:1.5;color:#111111',
  img: 'border:0;max-width:100%;height:auto',
  td: `font-family:${FONT}`,
  blockquote: 'margin:0 0 16px 0;padding:0 0 0 12px;border-left:3px solid #e5e5e5;color:#6b6b6b',
};

const TAG_OPEN = /<(p|a|h1|h2|ul|ol|li|img|td|blockquote)(\s[^>]*)?>/gi;
const STYLE_ATTR = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i;

// Добавляет базовые стили каждому тегу. Стиль автора идёт после базового и поэтому побеждает.
export function inlineCss(html: string): string {
  return html.replace(TAG_OPEN, (whole: string, tag: string, attrs: string | undefined) => {
    const base = INLINE_STYLES[tag.toLowerCase()];
    if (!base) return whole;
    const rest = attrs ?? '';
    const m = STYLE_ATTR.exec(rest);
    if (!m) return `<${tag}${rest} style="${base}">`;
    const own = (m[2] ?? m[3] ?? '').trim();
    const merged = own ? `${base};${own}` : base;
    return `<${tag}${rest.replace(STYLE_ATTR, ` style="${merged.replace(/"/g, "'")}"`)}>`;
  });
}

// ===== текст ↔ HTML =====

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;

function linkify(escapedLine: string): string {
  return escapedLine.replace(URL_IN_TEXT, (url) => `<a href="${url}">${url}</a>`);
}

// Текст → HTML: абзацы по пустой строке, переносы внутри абзаца → <br>, ссылки кликабельны.
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.split('\n').map((line) => linkify(escapeHtml(line))).join('<br>')}</p>`)
    .join('');
}

const ENTITY: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

// HTML → текст для text/plain части письма (когда автор задал только HTML).
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_w: string, href: string, label: string) => {
      const clean = label.replace(/<[^>]+>/g, '').trim();
      return clean && clean !== href ? `${clean} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|li|tr|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITY[e] ?? e)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Переписывает href="http(s)://..." через функцию (трекинг). mailto:, tel: и якоря не трогает.
export function rewriteLinks(html: string, rewrite: (url: string) => string): string {
  return html.replace(/(<a\s[^>]*href\s*=\s*)(["'])(https?:\/\/[^"']+)\2/gi, (_w: string, pre: string, q: string, url: string) => {
    const decoded = url.replace(/&amp;/g, '&');
    return `${pre}${q}${escapeHtml(rewrite(decoded))}${q}`;
  });
}

// ===== каркас письма =====

function footerHtml(footerText: string | undefined, unsubscribeUrl: string): string {
  const parts: string[] = [];
  if (footerText) parts.push(escapeHtml(footerText).replace(/\n/g, '<br>'));
  if (unsubscribeUrl) {
    parts.push(`<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b6b6b;text-decoration:underline">Отписаться от писем</a>`);
  }
  if (parts.length === 0) return '';
  return `<tr><td style="padding:16px 24px 0 24px;font-family:${FONT};font-size:12px;line-height:1.5;color:#6b6b6b">${parts.join('<br>')}</td></tr>`;
}

// Табличная вёрстка: так письмо одинаково выглядит в Outlook и веб-почте.
export function wrapLayout(content: string, opts: { preheader?: string; footerText?: string; unsubscribeUrl?: string; pixelUrl?: string }): string {
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(opts.preheader)}</div>`
    : '';
  const pixel = opts.pixelUrl
    ? `<img src="${escapeHtml(opts.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`
    : '';
  return (
    '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title></title></head>' +
    `<body style="margin:0;padding:0;background:#fafafa">${pre}` +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa">' +
    '<tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">' +
    `<tr><td style="padding:24px;background:#ffffff;border-radius:12px;font-family:${FONT};color:#111111">${content}</td></tr>` +
    footerHtml(opts.footerText, opts.unsubscribeUrl ?? '') +
    `</table></td></tr></table>${pixel}</body></html>`
  );
}

function textFooter(footerText: string | undefined, unsubscribeUrl: string): string {
  const parts = [footerText ?? '', unsubscribeUrl ? `Отписаться: ${unsubscribeUrl}` : ''].filter(Boolean);
  return parts.length ? `\n\n--\n${parts.join('\n')}` : '';
}

function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

// Главная функция: шаблон из БД + переменные → готовое письмо.
// Если в шаблоне только текст — HTML строится из текста; если только HTML — текст выводится из HTML.
export function renderEmail(template: EmailTemplateSource, vars: TemplateVars, opts: RenderOptions = {}): RenderedEmail {
  const subject = renderSubject(template.subject ?? '', vars);
  const unsubscribeUrl = stringify(vars.unsubscribe_url);
  const sourceHtml = (template.body_html ?? '').trim();
  const sourceText = (template.body_text ?? '').trim();

  let content = sourceHtml ? substitute(sourceHtml, vars, escapeHtml) : textToHtml(renderText(sourceText, vars));
  if (opts.linkRewriter) content = rewriteLinks(content, opts.linkRewriter);
  const html = inlineCss(wrapLayout(content, { preheader: opts.preheader, footerText: opts.footerText, unsubscribeUrl, pixelUrl: opts.pixelUrl }));

  const bodyText = sourceText ? renderText(sourceText, vars) : htmlToText(substitute(sourceHtml, vars, escapeHtml));
  const text = `${bodyText.trim()}${textFooter(opts.footerText, unsubscribeUrl)}`;

  if (byteLength(html) + byteLength(text) > MAX_EMAIL_BYTES) {
    throw new EmailTooLargeError('Письмо больше 500 КБ');
  }
  return { subject, text, html };
}
