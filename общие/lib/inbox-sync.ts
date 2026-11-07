// lib/inbox-sync.ts — приём почты по IMAP для cron check-replies (ТЗ §9.4).
// UID-трекинг через imap_state: читаем только UID >= uidnext; при смене UIDVALIDITY — сброс на 1,
// дубликаты отсекаются по emails_incoming.message_id (UNIQUE). Автоответы и спам не сохраняются,
// bounce → email_bounces (hard → no_contact, soft → повтор письма из email_queue).
// IMAP-клиент и БД — через интерфейсы: логика тестируется на фейках.
import type { Attachment, ParsedMail } from 'mailparser';
import type { FetchMessageObject, MailboxLockObject, MailboxObject, SearchObject } from 'imapflow';
import {
  classifyInbound, domainOf, firstAddress, isFreeMailDomain, messageFolder, parentIds, parseBounce,
  referencesList, safeFilename, sanitizeIncomingHtml, storedAttachments, threadIdOf, type BounceInfo,
} from './email-inbound';
import { htmlToText } from './email-render';

export interface ImapClientLike {
  mailbox: MailboxObject | false;
  connect(): Promise<void>;
  logout(): Promise<void>;
  close(): void;
  getMailboxLock(path: string): Promise<MailboxLockObject>;
  search(query: SearchObject, options?: { uid?: boolean }): Promise<number[] | false>;
  fetchOne(range: string, query: { source?: boolean; size?: boolean }, options?: { uid?: boolean }): Promise<FetchMessageObject | false>;
  messageFlagsAdd(range: string, flags: string[], options?: { uid?: boolean }): Promise<boolean>;
}

export type ImapState = { uidvalidity: number; uidnext: number };
export type StoredAttachment = { filename: string; mime_type: string; size_bytes: number; minio_path: string };
export type IncomingRow = {
  business_id: string | null; from_email: string; to_email: string; subject: string; body_text: string; body_html: string | null;
  message_id: string; in_reply_to: string | null; references: string | null; thread_id: string; email_account_id: string; received_at: string;
};

export interface InboxStore {
  getState(accountId: string): Promise<ImapState | null>;
  saveState(accountId: string, state: ImapState, nowIso: string): Promise<void>;
  incomingExists(messageId: string): Promise<boolean>;
  // Бизнес и корень цепочки по нашим исходящим/ранее принятым письмам.
  findByMessageIds(ids: string[]): Promise<{ business_id: string | null; thread_id: string | null } | null>;
  findBusinessByEmail(email: string): Promise<string | null>;
  findBusinessByDomain(domain: string): Promise<string | null>;
  insertIncoming(row: IncomingRow): Promise<string | null>;
  saveAttachment(incomingId: string, folder: string, filename: string, att: Attachment): Promise<StoredAttachment>;
  setAttachments(incomingId: string, list: StoredAttachment[]): Promise<void>;
  markReplied(businessId: string, text: string, nowIso: string): Promise<void>;
  recordBounce(accountId: string, bounce: BounceInfo, raw: string): Promise<void>;
  applyHardBounce(bounce: BounceInfo): Promise<void>;
  applySoftBounce(bounce: BounceInfo, nowIso: string): Promise<void>;
}

export type SyncDeps = {
  store: InboxStore;
  parse: (source: Buffer) => Promise<ParsedMail>;
  log: (message: string, payload: Record<string, unknown>) => Promise<unknown>;
  now: () => Date;
};

export type SyncStats = { stored: number; bounced: number; skipped: number; errors: number };

// Ограничения одного запуска: письма крупнее 10 МБ не скачиваем, не больше 50 писем на ящик.
export const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PER_ACCOUNT = 50;
const FIRST_RUN_DAYS = 7;
const DAY_MS = 86_400_000;
const MAX_TEXT = 20_000;
const MAX_HTML = 200_000;
const MAX_RAW_BOUNCE = 4_000;
const REPLY_PREVIEW = 500;

export function emptyStats(): SyncStats {
  return { stored: 0, bounced: 0, skipped: 0, errors: 0 };
}

// С какого UID читать. Первый запуск или смена UIDVALIDITY → с 1 (дубликаты отсекает message_id).
export function startPoint(state: ImapState | null, uidValidity: number): { from: number; reset: boolean } {
  if (!state || state.uidvalidity !== uidValidity) return { from: 1, reset: true };
  return { from: Math.max(1, state.uidnext), reset: false };
}

async function findBusiness(store: InboxStore, mail: ParsedMail, from: string): Promise<{ businessId: string | null; threadId: string | null }> {
  const parents = parentIds(mail);
  const linked = parents.length ? await store.findByMessageIds(parents) : null;
  if (linked?.business_id) return { businessId: linked.business_id, threadId: linked.thread_id };
  const byEmail = from ? await store.findBusinessByEmail(from) : null;
  if (byEmail) return { businessId: byEmail, threadId: linked?.thread_id ?? null };
  const domain = domainOf(from);
  // По домену бесплатной почты связывать нельзя: у тысяч бизнесов один gmail.com.
  const byDomain = domain && !isFreeMailDomain(domain) ? await store.findBusinessByDomain(domain) : null;
  return { businessId: byDomain, threadId: linked?.thread_id ?? null };
}

function bodies(mail: ParsedMail): { text: string; html: string | null } {
  const html = mail.html ? sanitizeIncomingHtml(mail.html).slice(0, MAX_HTML) : null;
  const text = (mail.text ?? (html ? htmlToText(html) : '')).slice(0, MAX_TEXT);
  return { text, html };
}

async function storeAttachments(deps: SyncDeps, incomingId: string, messageId: string, mail: ParsedMail): Promise<void> {
  const folder = messageFolder(messageId);
  const saved: StoredAttachment[] = [];
  const atts = storedAttachments(mail);
  for (let i = 0; i < atts.length; i += 1) {
    try {
      saved.push(await deps.store.saveAttachment(incomingId, folder, safeFilename(atts[i].filename, i), atts[i]));
    } catch (e) {
      await deps.log(`attachment: ${(e as Error).message}`, { incoming: incomingId });
    }
  }
  if (saved.length) await deps.store.setAttachments(incomingId, saved);
}

async function storeMessage(deps: SyncDeps, accountId: string, accountEmail: string, mail: ParsedMail, uid: number): Promise<boolean> {
  const messageId = mail.messageId ?? `<uid-${uid}-${accountId}@imap.local>`;
  if (await deps.store.incomingExists(messageId)) return false;
  const from = firstAddress(mail.from);
  const { businessId, threadId } = await findBusiness(deps.store, mail, from);
  const { text, html } = bodies(mail);
  const now = deps.now().toISOString();
  const id = await deps.store.insertIncoming({
    business_id: businessId, from_email: from, to_email: firstAddress(mail.to) || accountEmail, subject: (mail.subject ?? '').slice(0, 500),
    body_text: text, body_html: html, message_id: messageId, in_reply_to: mail.inReplyTo ?? null,
    references: referencesList(mail).join(' ') || null,
    thread_id: threadId ?? threadIdOf(mail, messageId), email_account_id: accountId, received_at: (mail.date ?? deps.now()).toISOString(),
  });
  // null — строка уже есть (гонка двух вызовов, UNIQUE message_id).
  if (!id) return false;
  await storeAttachments(deps, id, messageId, mail);
  if (businessId) await deps.store.markReplied(businessId, text.slice(0, REPLY_PREVIEW), now);
  return true;
}

async function handleBounce(deps: SyncDeps, accountId: string, mail: ParsedMail, source: Buffer): Promise<void> {
  const bounce = parseBounce(mail);
  if (!bounce) return;
  await deps.store.recordBounce(accountId, bounce, source.toString('utf8', 0, MAX_RAW_BOUNCE));
  if (bounce.type === 'hard') await deps.store.applyHardBounce(bounce);
  else await deps.store.applySoftBounce(bounce, deps.now().toISOString());
}

// Письмо не разбирается — «ядовитое»: повтор ничего не даст, его можно пропустить.
// Любая другая ошибка (БД, Storage) временная: UID не сдвигается, письмо перечитается следующим запуском.
export class MessageParseError extends Error {
  constructor(cause: unknown) {
    super(`parse: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'MessageParseError';
  }
}

async function parseOrThrow(deps: SyncDeps, source: Buffer): Promise<ParsedMail> {
  try {
    return await deps.parse(source);
  } catch (e) {
    throw new MessageParseError(e);
  }
}

// Одно письмо: тип → действие. Возвращает, как его посчитать в статистике.
export async function processMessage(deps: SyncDeps, accountId: string, accountEmail: string, uid: number, source: Buffer): Promise<keyof SyncStats> {
  const mail = await parseOrThrow(deps, source);
  const kind = classifyInbound(mail);
  if (kind === 'bounce') {
    await handleBounce(deps, accountId, mail, source);
    return 'bounced';
  }
  if (kind !== 'message') return 'skipped';
  return (await storeMessage(deps, accountId, accountEmail, mail, uid)) ? 'stored' : 'skipped';
}

async function listUids(client: ImapClientLike, from: number, now: Date): Promise<number[]> {
  // С нуля читаем только последние 7 дней: архив ящика не нужен и не влезет в бюджет cron.
  const query: SearchObject = from === 1 ? { uid: '1:*', since: new Date(now.getTime() - FIRST_RUN_DAYS * DAY_MS) } : { uid: `${from}:*` };
  const found = (await client.search(query, { uid: true })) || [];
  // IMAP: диапазон "N:*" при N > максимального UID возвращает последнее письмо — отбрасываем.
  return found.filter((u) => u >= from).sort((a, b) => a - b).slice(0, MAX_PER_ACCOUNT);
}

// Обработка открытого INBOX. deadline — момент, после которого новые письма не берём.
export async function syncMailbox(deps: SyncDeps, client: ImapClientLike, account: { id: string; email: string }, deadline: number): Promise<SyncStats> {
  const stats = emptyStats();
  if (!client.mailbox) return stats;
  const uidValidity = Number(client.mailbox.uidValidity);
  const start = startPoint(await deps.store.getState(account.id), uidValidity);
  const uids = await listUids(client, start.from, deps.now());
  let next = start.from;
  let complete = uids.length < MAX_PER_ACCOUNT;
  for (const uid of uids) {
    if (deps.now().getTime() >= deadline) {
      complete = false;
      break;
    }
    try {
      const msg = await client.fetchOne(String(uid), { source: true, size: true }, { uid: true });
      if (msg && msg.source && (msg.size ?? msg.source.length) <= MAX_MESSAGE_BYTES) {
        stats[await processMessage(deps, account.id, account.email, uid, msg.source)] += 1;
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      } else stats.skipped += 1;
    } catch (e) {
      stats.errors += 1;
      await deps.log(`imap message: ${(e as Error).message}`, { account: account.id, uid });
      // Битое письмо не блокирует ящик; временный сбой — останавливаемся, не теряя письмо.
      if (!(e instanceof MessageParseError)) {
        complete = false;
        break;
      }
    }
    next = uid + 1;
  }
  // Всё найденное обработано → можно сразу перейти к UIDNEXT ящика (новые письма получат UID не меньше).
  if (complete) next = Math.max(next, client.mailbox.uidNext);
  await deps.store.saveState(account.id, { uidvalidity: uidValidity, uidnext: next }, deps.now().toISOString());
  return stats;
}
