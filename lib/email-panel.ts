// lib/email-panel.ts — чистая логика админ-разделов email (ТЗ §13.4, §4.14–4.16): разбор форм,
// группировка входящих в нити, версии шаблонов, переменные предпросмотра. Без БД и Next — тестируется напрямую.
import { DEFAULT_DAILY_LIMIT, DEFAULT_IMAP_HOST, DEFAULT_IMAP_PORT, DEFAULT_SMTP_HOST, DEFAULT_SMTP_PORT, type SecureMode } from './email-accounts';
import { isValidEmail } from './notify';
import { extractVariables, type TemplateVars } from './email-render';
import { TEMPLATE_CHANNELS, OUTREACH_TYPES, CLIENT_TYPES, type TemplateChannel } from './email-template-types';

export { TEMPLATE_CHANNELS, OUTREACH_TYPES, CLIENT_TYPES };
export type { TemplateChannel };

// Источник полей формы: FormData или любой объект с get().
export type FormLike = { get(name: string): FormDataEntryValue | null };
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const MAX_PORT = 65_535;
// Yandex 360 «Расширенный»: не больше 500 писем в сутки с ящика; выше — блокировка за спам.
const MAX_DAILY_LIMIT = 500;
const MIN_PASSWORD = 4;
const MAX_PASSWORD = 200;
const MAX_FROM_NAME = 80;
const SECURE_MODES: readonly SecureMode[] = ['tls', 'starttls', 'none'];

export function isUuidValue(value: string): boolean {
  return UUID_RE.test(value);
}

export function str(form: FormLike, name: string, max = 500): string {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function intField(form: FormLike, name: string, fallback: number, min: number, max: number): number | null {
  const raw = str(form, name, 10);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function secureField(form: FormLike, name: string, port: number): SecureMode {
  const raw = str(form, name, 10) as SecureMode;
  if (SECURE_MODES.includes(raw)) return raw;
  return port === DEFAULT_SMTP_PORT || port === DEFAULT_IMAP_PORT ? 'tls' : 'starttls';
}

// ===== ящики =====

export type AccountInput = {
  email: string;
  from_name: string | null;
  reply_to: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: SecureMode;
  smtp_user: string;
  imap_host: string;
  imap_port: number;
  imap_secure: SecureMode;
  imap_user: string;
  daily_limit: number;
  // Пустой пароль при редактировании — «не менять».
  smtp_pass: string | null;
  imap_pass: string | null;
};

function hostField(form: FormLike, name: string, fallback: string): string | null {
  const host = str(form, name, 253).toLowerCase() || fallback;
  return HOST_RE.test(host) ? host : null;
}

function passwordField(form: FormLike, name: string): string | null | false {
  const v = form.get(name);
  const pass = typeof v === 'string' ? v : '';
  if (!pass) return null;
  return pass.length >= MIN_PASSWORD && pass.length <= MAX_PASSWORD ? pass : false;
}

function optionalEmail(form: FormLike, name: string): string | null | false {
  const v = str(form, name, 254).toLowerCase();
  if (!v) return null;
  return isValidEmail(v) ? v : false;
}

// Разбор формы ящика. requirePassword — для нового ящика пароль обязателен.
export function parseAccountForm(form: FormLike, requirePassword: boolean): Parsed<AccountInput> {
  const email = str(form, 'email', 254).toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: 'Некорректный адрес ящика' };
  const smtpHost = hostField(form, 'smtp_host', DEFAULT_SMTP_HOST);
  const imapHost = hostField(form, 'imap_host', DEFAULT_IMAP_HOST);
  if (!smtpHost || !imapHost) return { ok: false, error: 'Некорректный адрес сервера' };
  const smtpPort = intField(form, 'smtp_port', DEFAULT_SMTP_PORT, 1, MAX_PORT);
  const imapPort = intField(form, 'imap_port', DEFAULT_IMAP_PORT, 1, MAX_PORT);
  if (smtpPort === null || imapPort === null) return { ok: false, error: 'Порт — число от 1 до 65535' };
  const limit = intField(form, 'daily_limit', DEFAULT_DAILY_LIMIT, 1, MAX_DAILY_LIMIT);
  if (limit === null) return { ok: false, error: `Лимит — от 1 до ${MAX_DAILY_LIMIT} писем в день` };
  const smtpPass = passwordField(form, 'smtp_pass');
  const imapPass = passwordField(form, 'imap_pass');
  if (smtpPass === false || imapPass === false) return { ok: false, error: `Пароль — от ${MIN_PASSWORD} до ${MAX_PASSWORD} символов` };
  if (requirePassword && !smtpPass) return { ok: false, error: 'Укажите пароль приложения' };
  const replyTo = optionalEmail(form, 'reply_to');
  if (replyTo === false) return { ok: false, error: 'Некорректный адрес для ответов' };
  // Имя отправителя попадает в заголовок From: переводы строк и кавычки недопустимы.
  const fromName = str(form, 'from_name', MAX_FROM_NAME).replace(/["\r\n<>]/g, '') || null;
  return {
    ok: true,
    value: {
      email, from_name: fromName, reply_to: replyTo,
      smtp_host: smtpHost, smtp_port: smtpPort, smtp_secure: secureField(form, 'smtp_secure', smtpPort), smtp_user: str(form, 'smtp_user', 254) || email,
      imap_host: imapHost, imap_port: imapPort, imap_secure: secureField(form, 'imap_secure', imapPort), imap_user: str(form, 'imap_user', 254) || email,
      daily_limit: limit, smtp_pass: smtpPass, imap_pass: imapPass,
    },
  };
}

// ===== входящие =====

export type InboxMessage = {
  id: string;
  thread_id: string | null;
  message_id: string | null;
  from_email: string | null;
  subject: string | null;
  received_at: string | null;
  is_read: boolean;
  business_id: string | null;
  email_account_id: string | null;
};

export type InboxThread<M extends InboxMessage = InboxMessage> = {
  key: string;
  messages: M[];
  unread: number;
  answered: boolean;
  last_at: number;
};

export type InboxFilter = 'all' | 'unread' | 'answered';

export function parseInboxFilter(value: string | undefined): InboxFilter {
  return value === 'unread' || value === 'answered' ? value : 'all';
}

function timeOf(m: InboxMessage): number {
  const t = m.received_at ? Date.parse(m.received_at) : NaN;
  return Number.isFinite(t) ? t : 0;
}

// Нить — по thread_id (корень цепочки In-Reply-To/References, ТЗ §13.4). Без thread_id письмо — отдельная нить.
// answeredIds — Message-ID входящих, на которые уже поставлен ответ в email_queue.
export function groupThreads<M extends InboxMessage>(messages: M[], answeredIds: ReadonlySet<string>): InboxThread<M>[] {
  const map = new Map<string, M[]>();
  for (const m of messages) {
    const key = m.thread_id || m.message_id || m.id;
    const list = map.get(key);
    if (list) list.push(m);
    else map.set(key, [m]);
  }
  const threads: InboxThread<M>[] = [];
  for (const [key, list] of map) {
    list.sort((a, b) => timeOf(a) - timeOf(b));
    threads.push({
      key,
      messages: list,
      unread: list.filter((m) => !m.is_read).length,
      answered: list.some((m) => Boolean(m.message_id && answeredIds.has(m.message_id))),
      last_at: Math.max(...list.map(timeOf)),
    });
  }
  return threads.sort((a, b) => b.last_at - a.last_at);
}

export function filterThreads<M extends InboxMessage>(threads: InboxThread<M>[], filter: InboxFilter): InboxThread<M>[] {
  if (filter === 'unread') return threads.filter((t) => t.unread > 0);
  if (filter === 'answered') return threads.filter((t) => t.answered);
  return threads;
}

// «Re: » добавляется один раз; переводы строк вырезаются (тема — заголовок письма).
export function replySubject(subject: string | null | undefined): string {
  const clean = (subject ?? '').replace(/[\r\n]+/g, ' ').trim();
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`.trim();
}

// References ответа = References исходного + его Message-ID (RFC 5322 §3.6.4), не длиннее 20 ссылок.
export function replyReferences(original: { message_id: string | null; references: string | null }): string | null {
  const refs = (original.references ?? '').split(/\s+/).filter(Boolean);
  if (original.message_id && !refs.includes(original.message_id)) refs.push(original.message_id);
  return refs.length ? refs.slice(-20).join(' ') : null;
}

// ===== шаблоны =====


export type TemplateInput = {
  channel: TemplateChannel;
  type: string | null;
  vertical_template_id: string | null;
  name: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  variables: string[];
  active: boolean;
};

const MAX_NAME = 120;
const MAX_SUBJECT = 200;
const MAX_BODY_TEXT = 20_000;
const MAX_BODY_HTML = 200_000;

function typeAllowed(channel: TemplateChannel, type: string): boolean {
  const list: readonly string[] = channel === 'outreach' ? OUTREACH_TYPES : CLIENT_TYPES;
  return list.includes(type);
}

export function parseTemplateForm(form: FormLike): Parsed<TemplateInput> {
  const channel = str(form, 'channel', 20) as TemplateChannel;
  if (!TEMPLATE_CHANNELS.includes(channel)) return { ok: false, error: 'Неизвестный канал' };
  const type = str(form, 'type', 40) || null;
  if (type && !typeAllowed(channel, type)) return { ok: false, error: 'Тип не подходит к каналу' };
  const vertical = str(form, 'vertical_template_id', 36) || null;
  if (vertical && !isUuidValue(vertical)) return { ok: false, error: 'Некорректная ниша' };
  const name = str(form, 'name', MAX_NAME);
  const subject = str(form, 'subject', MAX_SUBJECT).replace(/[\r\n]+/g, ' ');
  const bodyText = (typeof form.get('body_text') === 'string' ? String(form.get('body_text')) : '').slice(0, MAX_BODY_TEXT).trim();
  const bodyHtml = (typeof form.get('body_html') === 'string' ? String(form.get('body_html')) : '').slice(0, MAX_BODY_HTML).trim();
  if (!name || !subject) return { ok: false, error: 'Заполните название и тему' };
  if (!bodyText && !bodyHtml) return { ok: false, error: 'Нужен текст или HTML письма' };
  const vars = extractVariables(`${subject}\n${bodyText}\n${bodyHtml}`);
  return {
    ok: true,
    value: {
      channel, type, vertical_template_id: vertical, name, subject, body_text: bodyText, body_html: bodyHtml || null,
      variables: vars.known, active: form.get('active') !== '0',
    },
  };
}

export type TemplateContent = { subject: string | null; body_text: string | null; body_html: string | null };

// Новая версия нужна, только если содержимое изменилось (смена названия/активности версию не создаёт).
export function contentChanged(prev: TemplateContent, next: TemplateContent): boolean {
  const norm = (v: string | null) => (v ?? '').trim();
  return norm(prev.subject) !== norm(next.subject) || norm(prev.body_text) !== norm(next.body_text) || norm(prev.body_html) !== norm(next.body_html);
}

export function unknownPlaceholders(input: Pick<TemplateInput, 'subject' | 'body_text' | 'body_html'>): string[] {
  return extractVariables(`${input.subject}\n${input.body_text}\n${input.body_html ?? ''}`).unknown;
}

// Демо-значения для предпросмотра клиентских писем: реальные данные клиентов в админку не подставляются.
export function sampleClientVars(site: string): TemplateVars {
  return {
    name: 'Шиномонтаж «Колесо»', business_name: 'Шиномонтаж «Колесо»', city: 'Казань', url: `${site}/shinomontazh/koleso`,
    phone: '+7 900 000-00-00', rating: '4.8', vertical_name_lower: 'шиномонтаж', client_name: 'Анна',
    service_name: 'Сезонная замена шин', scheduled_at_local: '20 октября, 14:30', business_address: 'ул. Примерная, 1',
    cancel_url: `${site}/b/demo/cancel`, reschedule_url: `${site}/b/demo/reschedule`, panel_url: `${site}/shinomontazh/koleso/panel`,
    email: 'owner@example.com', password: '••••••••', support_until: '20 ноября 2026', download_url: `${site}/download/demo`,
    unsubscribe_url: `${site}/unsubscribe/preview`,
  };
}
