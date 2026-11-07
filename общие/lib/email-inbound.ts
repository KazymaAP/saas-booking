// lib/email-inbound.ts — разбор входящих писем (ТЗ §9.4): автоответы, bounce (DSN, RFC 3464),
// threading по Message-ID/In-Reply-To/References, санитизация HTML, безопасные имена вложений.
// Чистые функции поверх ParsedMail из mailparser — без IMAP и БД.
import type { AddressObject, Attachment, HeaderValue, ParsedMail } from 'mailparser';
import sanitizeHtml from 'sanitize-html';

export type BounceType = 'hard' | 'soft';
export type BounceInfo = {
  type: BounceType;
  recipient: string | null;
  code: number | null;
  status: string | null;
  originalMessageId: string | null;
  reason: string;
};

export type InboundKind = 'bounce' | 'auto_reply' | 'spam' | 'message';

// ТЗ/промт: hard — 550, 551, 553 (нет адреса, адрес не принимается). 4xx и прочие 5xx — soft (повтор).
const HARD_CODES = new Set([550, 551, 553]);
const MAX_REASON = 500;
const MAX_FILENAME = 120;
// Типичные бесплатные почтовые домены: связывать по ним бизнес нельзя — это не домен компании.
const FREE_MAIL_DOMAINS = new Set([
  'yandex.ru', 'ya.ru', 'yandex.com', 'mail.ru', 'bk.ru', 'inbox.ru', 'list.ru', 'internet.ru', 'rambler.ru',
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'yahoo.com',
  'proton.me', 'protonmail.com', 'narod.ru', 'lenta.ru', 'autorambler.ru', 'myrambler.ru',
]);
const DAEMON_LOCAL = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)$/i;

// ===== заголовки =====

function headerString(value: HeaderValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : v.value)).join(', ');
  if (value instanceof Date) return value.toISOString();
  if ('value' in value && typeof value.value === 'string') return value.value;
  if ('text' in value && typeof value.text === 'string') return value.text;
  return '';
}

export function header(mail: Pick<ParsedMail, 'headers'>, name: string): string {
  return headerString(mail.headers.get(name.toLowerCase())).trim();
}

export function firstAddress(addr: AddressObject | AddressObject[] | undefined): string {
  const list = Array.isArray(addr) ? addr : addr ? [addr] : [];
  for (const a of list) {
    const found = a.value.find((v) => v.address);
    if (found?.address) return found.address.trim().toLowerCase();
  }
  return '';
}

export function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

// ===== автоответы и спам =====

// RFC 3834 + распространённые нестандартные заголовки (Exchange, Яндекс, mail.ru).
export function isAutoReply(mail: Pick<ParsedMail, 'headers'>): boolean {
  const autoSubmitted = header(mail, 'auto-submitted').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (header(mail, 'x-autoreply') || header(mail, 'x-autorespond') || header(mail, 'x-auto-response-suppress')) return true;
  const precedence = header(mail, 'precedence').toLowerCase();
  return precedence === 'bulk' || precedence === 'auto_reply' || precedence === 'junk' || precedence === 'list';
}

// Вердикт Яндекса (X-Yandex-Spam): 1 — чисто, 4 — спам. Другие значения встречаются у служебных писем — не трогаем.
const YANDEX_SPAM_VERDICT = '4';

// Спам-вердикты, которые ставят сами почтовые серверы: SpamAssassin (X-Spam-Flag/X-Spam-Status) и Яндекс 360.
export function isSpam(mail: Pick<ParsedMail, 'headers'>): boolean {
  if (/^yes/i.test(header(mail, 'x-spam-flag'))) return true;
  if (/^yes\b/i.test(header(mail, 'x-spam-status'))) return true;
  return header(mail, 'x-yandex-spam') === YANDEX_SPAM_VERDICT;
}

// ===== bounce =====

function partText(att: Attachment): string {
  return att.content.toString('utf8');
}

// Тексты, в которых ищем поля DSN: тело + служебные части (delivery-status, вложенные заголовки).
function bounceSources(mail: ParsedMail): { dsn: string; headersPart: string; body: string } {
  const atts = mail.attachments ?? [];
  const dsn = atts.filter((a) => /delivery-status/i.test(a.contentType)).map(partText).join('\n');
  const headersPart = atts.filter((a) => /rfc822/i.test(a.contentType)).map(partText).join('\n');
  return { dsn, headersPart, body: mail.text ?? '' };
}

export function looksLikeBounce(mail: ParsedMail): boolean {
  const from = firstAddress(mail.from);
  const local = from.split('@')[0] ?? '';
  const contentType = header(mail, 'content-type').toLowerCase();
  if (contentType.includes('report-type=delivery-status')) return true;
  if ((mail.attachments ?? []).some((a) => /delivery-status/i.test(a.contentType))) return true;
  return DAEMON_LOCAL.test(local) && /undeliver|delivery|failure|недостав|не доставлено|returned/i.test(mail.subject ?? '');
}

function match(re: RegExp, ...texts: string[]): string | null {
  for (const t of texts) {
    const m = re.exec(t);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function classifyBounce(code: number | null, status: string | null): BounceType {
  if (code !== null && HARD_CODES.has(code)) return 'hard';
  // Enhanced status 5.1.x — проблема адреса (нет ящика, неверный домен).
  if (status && /^5\.1\.\d+$/.test(status)) return 'hard';
  return 'soft';
}

export function parseBounce(mail: ParsedMail): BounceInfo | null {
  if (!looksLikeBounce(mail)) return null;
  const { dsn, headersPart, body } = bounceSources(mail);
  const recipient = match(/(?:final|original)-recipient:\s*(?:rfc822;)?\s*<?([^\s<>;]+@[^\s<>;]+)>?/i, dsn, body)
    ?? match(/<([^\s<>]+@[^\s<>]+)>/, body);
  const status = match(/^\s*status:\s*([245]\.\d{1,3}\.\d{1,3})/im, dsn, body) ?? match(/\b([45]\.\d\.\d{1,3})\b/, body);
  const codeText = match(/diagnostic-code:\s*smtp;\s*(\d{3})/i, dsn, body) ?? match(/\b([45]\d{2})[\s-][\d.]*\s*\S/, body);
  const code = codeText ? Number(codeText) : null;
  const originalMessageId = match(/^message-id:\s*(<[^>]+>)/im, headersPart, body);
  const reason = (match(/diagnostic-code:\s*([^\r\n]+)/i, dsn, body) ?? (mail.subject ?? 'bounce')).slice(0, MAX_REASON);
  return {
    type: classifyBounce(code, status),
    recipient: recipient ? recipient.toLowerCase() : null,
    code,
    status,
    originalMessageId,
    reason,
  };
}

export function classifyInbound(mail: ParsedMail): InboundKind {
  if (looksLikeBounce(mail)) return 'bounce';
  if (isAutoReply(mail)) return 'auto_reply';
  if (isSpam(mail)) return 'spam';
  return 'message';
}

// ===== threading =====

export function referencesList(mail: Pick<ParsedMail, 'references'>): string[] {
  const refs = mail.references;
  const list = Array.isArray(refs) ? refs : refs ? refs.split(/\s+/) : [];
  return list.map((r) => r.trim()).filter((r) => r.startsWith('<') && r.endsWith('>'));
}

// Идентификаторы писем, на которые это письмо отвечает: In-Reply-To первым, затем References с конца.
export function parentIds(mail: Pick<ParsedMail, 'inReplyTo' | 'references'>): string[] {
  const ids = [mail.inReplyTo ?? '', ...referencesList(mail).reverse()].map((s) => s.trim()).filter(Boolean);
  return [...new Set(ids)];
}

// thread_id — корень цепочки: первый References, иначе In-Reply-To, иначе собственный Message-ID.
export function threadIdOf(mail: Pick<ParsedMail, 'inReplyTo' | 'references' | 'messageId'>, fallback: string): string {
  return referencesList(mail)[0] ?? mail.inReplyTo?.trim() ?? mail.messageId ?? fallback;
}

// ===== санитизация =====

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'img', 'font', 'center',
];

// HTML из чужого письма: без скриптов, стилей, форм, обработчиков, внешних картинок (трекеры отправителя).
export function sanitizeIncomingHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'title', 'rel', 'target'], img: ['src', 'alt', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['data', 'cid'] },
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }) },
    disallowedTagsMode: 'discard',
    // Картинка без допустимого src (внешний трекер удалён) — пустой тег не нужен.
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  });
}

// ===== вложения =====

// Имя файла для пути в хранилище: без каталогов, управляющих символов и «..».
export function safeFilename(name: string | undefined, index: number): string {
  // eslint-disable-next-line no-control-regex
  const base = (name ?? '').split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, '_').replace(/^\.+/, '').trim() ?? '';
  const clean = base.slice(-MAX_FILENAME);
  return clean || `attachment-${index + 1}.bin`;
}

// Каталог по Message-ID: только безопасные символы.
export function messageFolder(messageId: string): string {
  return messageId.replace(/^<|>$/g, '').replace(/[^A-Za-z0-9._@-]+/g, '_').slice(0, 200) || 'unknown';
}

export function storedAttachments(mail: ParsedMail): Attachment[] {
  // Встроенные картинки подписи (related, cid) — не вложения для оператора.
  return (mail.attachments ?? []).filter((a) => !a.related && !/delivery-status|rfc822/i.test(a.contentType));
}
