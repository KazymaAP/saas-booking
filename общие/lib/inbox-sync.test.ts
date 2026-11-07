// lib/inbox-sync.test.ts — синхронизация ящика на фейковом IMAP-клиенте и хранилище в памяти:
// UID-трекинг, смена UIDVALIDITY, дубли, автоответы, bounce, связка с бизнесом, вложения.
import { describe, expect, it } from 'vitest';
import { simpleParser } from 'mailparser';
import type { FetchMessageObject, MailboxObject, SearchObject } from 'imapflow';
import { dsn, raw } from './__fixtures__/mail';
import { MAX_PER_ACCOUNT, startPoint, syncMailbox, type ImapClientLike, type ImapState, type IncomingRow, type InboxStore, type SyncDeps } from './inbox-sync';
import type { BounceInfo } from './email-inbound';

const NOW = new Date('2026-10-15T10:00:00Z');

function fakeImap(messages: Record<number, string>, mailbox: Partial<MailboxObject> = {}) {
  const seen: number[] = [];
  const searches: SearchObject[] = [];
  const uids = Object.keys(messages).map(Number);
  const client: ImapClientLike = {
    mailbox: { path: 'INBOX', exists: uids.length, uidValidity: 7n, uidNext: Math.max(0, ...uids) + 1, ...mailbox },
    connect: async () => undefined,
    logout: async () => undefined,
    close: () => undefined,
    getMailboxLock: async () => ({ path: 'INBOX', release: () => undefined }),
    search: async (q) => {
      searches.push(q);
      const from = Number(String(q.uid ?? '1:*').split(':')[0]);
      const hits = uids.filter((u) => u >= from);
      // Поведение IMAP: "N:*" при N > max UID возвращает последнее письмо.
      return hits.length ? hits : uids.slice(-1);
    },
    fetchOne: async (range) => {
      const src = messages[Number(range)];
      if (src === undefined) return false;
      const msg: FetchMessageObject = { seq: 1, uid: Number(range), size: src.length, source: Buffer.from(src, 'utf8') };
      return msg;
    },
    messageFlagsAdd: async (range) => {
      seen.push(Number(range));
      return true;
    },
  };
  return { client, seen, searches };
}

function memoryInbox(opts: { state?: ImapState; outgoing?: Record<string, string>; businessByEmail?: Record<string, string>; businessByDomain?: Record<string, string> } = {}) {
  const incoming: IncomingRow[] = [];
  const bounces: BounceInfo[] = [];
  const hard: BounceInfo[] = [];
  const soft: BounceInfo[] = [];
  const replied: string[] = [];
  const attachments: string[] = [];
  let state = opts.state ?? null;
  const store: InboxStore = {
    getState: async () => state,
    saveState: async (_id, s) => {
      state = s;
    },
    incomingExists: async (id) => incoming.some((r) => r.message_id === id),
    findByMessageIds: async (ids) => {
      const biz = ids.map((i) => opts.outgoing?.[i]).find(Boolean);
      return biz ? { business_id: biz, thread_id: null } : null;
    },
    findBusinessByEmail: async (e) => opts.businessByEmail?.[e] ?? null,
    findBusinessByDomain: async (d) => opts.businessByDomain?.[d] ?? null,
    insertIncoming: async (row) => {
      incoming.push(row);
      return `in-${incoming.length}`;
    },
    saveAttachment: async (_id, folder, filename, att) => {
      attachments.push(`${folder}/${filename}`);
      return { filename, mime_type: att.contentType, size_bytes: att.size, minio_path: `email/${folder}/${filename}` };
    },
    setAttachments: async () => undefined,
    markReplied: async (id) => void replied.push(id),
    recordBounce: async (_a, b) => void bounces.push(b),
    applyHardBounce: async (b) => void hard.push(b),
    applySoftBounce: async (b) => void soft.push(b),
  };
  return { store, incoming, bounces, hard, soft, replied, attachments, getState: () => state };
}

function deps(store: InboxStore): SyncDeps & { logs: string[] } {
  const logs: string[] = [];
  return { store, parse: (s) => simpleParser(s), log: async (m) => void logs.push(m), now: () => NOW, logs };
}

const ACC = { id: 'acc1', email: 'sales@zapishisya.ru' };
const FAR = NOW.getTime() + 60_000;

describe('startPoint', () => {
  it('нет состояния или сменился UIDVALIDITY → с 1', () => {
    expect(startPoint(null, 7)).toEqual({ from: 1, reset: true });
    expect(startPoint({ uidvalidity: 6, uidnext: 50 }, 7)).toEqual({ from: 1, reset: true });
    expect(startPoint({ uidvalidity: 7, uidnext: 50 }, 7)).toEqual({ from: 50, reset: false });
  });
});

describe('syncMailbox', () => {
  it('сохраняет ответ, связывает по In-Reply-To, ставит \\Seen, двигает uidnext', async () => {
    const m = memoryInbox({ outgoing: { '<q1@zapishisya.ru>': 'biz1' } });
    const imap = fakeImap({ 3: raw({ 'In-Reply-To': '<q1@zapishisya.ru>', From: 'owner@gmail.com' }, 'Да, интересно') });
    const s = await syncMailbox(deps(m.store), imap.client, ACC, FAR);
    expect(s).toMatchObject({ stored: 1, bounced: 0 });
    expect(m.incoming[0]).toMatchObject({ business_id: 'biz1', from_email: 'owner@gmail.com', in_reply_to: '<q1@zapishisya.ru>' });
    expect(m.replied).toEqual(['biz1']);
    expect(imap.seen).toEqual([3]);
    expect(m.getState()).toEqual({ uidvalidity: 7, uidnext: 4 });
  });

  it('первый запуск ищет только за 7 дней', async () => {
    const imap = fakeImap({ 1: raw({}, 'x') });
    await syncMailbox(deps(memoryInbox().store), imap.client, ACC, FAR);
    expect(imap.searches[0].since?.toISOString()).toBe(new Date(NOW.getTime() - 7 * 86_400_000).toISOString());
  });

  it('продолжает с uidnext и не перечитывает последнее письмо (N:* при N > max)', async () => {
    const m = memoryInbox({ state: { uidvalidity: 7, uidnext: 10 } });
    const imap = fakeImap({ 9: raw({}, 'старое') });
    const s = await syncMailbox(deps(m.store), imap.client, ACC, FAR);
    expect(s.stored).toBe(0);
    expect(m.incoming).toHaveLength(0);
  });

  it('смена UIDVALIDITY: перечитывание без дублей по message_id', async () => {
    const m = memoryInbox({ state: { uidvalidity: 1, uidnext: 100 } });
    const msgs = { 1: raw({}, 'a'), 2: raw({ 'Message-ID': '<r2@koleso.ru>' }, 'b') };
    await syncMailbox(deps(m.store), fakeImap(msgs).client, ACC, FAR);
    await syncMailbox(deps(m.store), fakeImap(msgs, { uidValidity: 2n }).client, ACC, FAR);
    expect(m.incoming).toHaveLength(2);
  });

  it('автоответ не сохраняется, но помечается прочитанным', async () => {
    const m = memoryInbox();
    const imap = fakeImap({ 1: raw({ 'Auto-Submitted': 'auto-replied' }, 'Я в отпуске') });
    const s = await syncMailbox(deps(m.store), imap.client, ACC, FAR);
    expect(s.skipped).toBe(1);
    expect(m.incoming).toHaveLength(0);
    expect(imap.seen).toEqual([1]);
  });

  it('hard bounce → email_bounces + no_contact; soft → retry', async () => {
    const m = memoryInbox();
    const imap = fakeImap({ 1: dsn('a@koleso.ru', '5.1.1', '550 5.1.1 unknown'), 2: dsn('b@koleso.ru', '4.2.2', '452 full', '<o2@z>') });
    const s = await syncMailbox(deps(m.store), imap.client, ACC, FAR);
    expect(s.bounced).toBe(2);
    expect(m.hard.map((b) => b.recipient)).toEqual(['a@koleso.ru']);
    expect(m.soft.map((b) => b.recipient)).toEqual(['b@koleso.ru']);
    expect(m.incoming).toHaveLength(0);
  });

  it('связка по домену — только для корпоративного домена', async () => {
    const m = memoryInbox({ businessByDomain: { 'koleso.ru': 'biz2', 'gmail.com': 'wrong' } });
    await syncMailbox(deps(m.store), fakeImap({ 1: raw({}, 'x'), 2: raw({ From: 'x@gmail.com', 'Message-ID': '<g@gmail.com>' }, 'y') }).client, ACC, FAR);
    expect(m.incoming.map((r) => r.business_id)).toEqual(['biz2', null]);
  });

  it('HTML санитизируется, вложения сохраняются по безопасному пути', async () => {
    const b = 'B';
    const body = [
      `--${b}`, 'Content-Type: text/html; charset=utf-8', '', '<p>Ок</p><script>alert(1)</script>',
      `--${b}`, 'Content-Type: application/pdf; name="../price.pdf"', 'Content-Disposition: attachment; filename="../price.pdf"',
      'Content-Transfer-Encoding: base64', '', Buffer.from('%PDF').toString('base64'), `--${b}--`, '',
    ].join('\r\n');
    const m = memoryInbox();
    await syncMailbox(deps(m.store), fakeImap({ 1: raw({ 'Content-Type': `multipart/mixed; boundary="${b}"` }, body) }).client, ACC, FAR);
    expect(m.incoming[0].body_html).not.toContain('script');
    expect(m.attachments).toEqual(['r1@koleso.ru/price.pdf']);
  });

  it('битое письмо логируется и не блокирует следующее', async () => {
    const m = memoryInbox();
    const d = deps(m.store);
    const failing: SyncDeps = { ...d, parse: async (s) => (s.toString().includes('BROKEN') ? Promise.reject(new Error('parse failed')) : simpleParser(s)) };
    const s = await syncMailbox(failing, fakeImap({ 1: 'BROKEN', 2: raw({}, 'ok') }).client, ACC, FAR);
    expect(s).toMatchObject({ errors: 1, stored: 1 });
    expect(d.logs[0]).toContain('parse failed');
  });

  it('дедлайн: необработанные письма остаются на следующий запуск', async () => {
    const m = memoryInbox();
    const s = await syncMailbox(deps(m.store), fakeImap({ 1: raw({}, 'x') }).client, ACC, NOW.getTime());
    expect(s.stored).toBe(0);
    expect(m.getState()?.uidnext).toBe(1);
  });

  it(`не больше ${MAX_PER_ACCOUNT} писем за запуск`, async () => {
    const msgs = Object.fromEntries(Array.from({ length: MAX_PER_ACCOUNT + 5 }, (_, i) => [i + 1, raw({ 'Message-ID': `<m${i}@k.ru>` }, 'x')]));
    const m = memoryInbox();
    const s = await syncMailbox(deps(m.store), fakeImap(msgs).client, ACC, FAR);
    expect(s.stored).toBe(MAX_PER_ACCOUNT);
    expect(m.getState()?.uidnext).toBe(MAX_PER_ACCOUNT + 1);
  });
});

describe('syncMailbox: временные сбои (раунд 2)', () => {
  it('сбой БД на письме: UID не сдвигается, письмо перечитается и сохранится', async () => {
    const m = memoryInbox();
    let failNext = true;
    const flaky: InboxStore = { ...m.store, insertIncoming: async (row) => {
      if (failNext) {
        failNext = false;
        throw new Error('db down');
      }
      return m.store.insertIncoming(row);
    } };
    const msgs = { 1: raw({ 'Message-ID': '<a1@k.ru>' }, 'a'), 2: raw({ 'Message-ID': '<a2@k.ru>' }, 'b') };
    const first = await syncMailbox(deps(flaky), fakeImap(msgs).client, ACC, FAR);
    expect(first).toMatchObject({ errors: 1, stored: 0 });
    expect(m.getState()?.uidnext).toBe(1);
    const second = await syncMailbox(deps(flaky), fakeImap(msgs).client, ACC, FAR);
    expect(second.stored).toBe(2);
    expect(m.incoming.map((r) => r.message_id)).toEqual(['<a1@k.ru>', '<a2@k.ru>']);
  });

  it('неразбираемое письмо пропускается навсегда (не блокирует ящик)', async () => {
    const m = memoryInbox({ state: { uidvalidity: 7, uidnext: 1 } });
    const d = deps(m.store);
    const failing: SyncDeps = { ...d, parse: async () => Promise.reject(new Error('bad mime')) };
    await syncMailbox(failing, fakeImap({ 1: 'x', 2: 'y' }).client, ACC, FAR);
    expect(m.getState()?.uidnext).toBe(3);
  });
});
