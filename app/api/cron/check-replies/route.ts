// app/api/cron/check-replies/route.ts — входящие по IMAP (ТЗ §9.4; cron раз в 5 минут, ≤ 60 с).
// Каждый ящик — отдельное подключение; сбой одного ящика логируется и не останавливает остальные.
import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { isCronAuthorized } from '@/lib/cron';
import { logError } from '@/lib/log';
import { maskEmail, maskPii } from '@/lib/notify';
import { imapOptions, markFailed, markHealthy, supabaseAccountStore, type EmailAccountRecord } from '@/lib/email-accounts';
import { emptyStats, syncMailbox, type SyncDeps, type SyncStats } from '@/lib/inbox-sync';
import { supabaseInboxStore } from '@/lib/inbox-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Оставляем 10 с запаса до лимита функции на logout и ответ.
const BUDGET_MS = 50_000;
const IMAP_TIMEOUT_MS = 15_000;

function errorText(e: unknown): string {
  return maskPii(e instanceof Error ? e.message : String(e)).slice(0, 300);
}

async function syncAccount(deps: SyncDeps, acc: EmailAccountRecord, deadline: number): Promise<SyncStats> {
  const opts = imapOptions(acc);
  if (!opts) return emptyStats();
  const client = new ImapFlow({
    ...opts, logger: false, disableAutoIdle: true,
    connectionTimeout: IMAP_TIMEOUT_MS, greetingTimeout: IMAP_TIMEOUT_MS, socketTimeout: IMAP_TIMEOUT_MS,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      return await syncMailbox(deps, client, { id: acc.id, email: acc.email }, deadline);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const deadline = Date.now() + BUDGET_MS;
  const accounts = supabaseAccountStore();
  const deps: SyncDeps = {
    store: supabaseInboxStore(),
    parse: (source) => simpleParser(source),
    log: (message, payload) => logError('email', maskPii(message), payload),
    now: () => new Date(),
  };
  const total = emptyStats();
  let list: EmailAccountRecord[];
  try {
    list = await accounts.listActive();
  } catch (e) {
    await logError('email', `check-replies: ${errorText(e)}`);
    return NextResponse.json({ ok: false, error: 'accounts_unavailable' }, { status: 500 });
  }

  for (const acc of list) {
    if (Date.now() >= deadline) break;
    try {
      const s = await syncAccount(deps, acc, deadline);
      total.stored += s.stored;
      total.bounced += s.bounced;
      total.skipped += s.skipped;
      total.errors += s.errors;
      await markHealthy(accounts, acc);
    } catch (e) {
      total.errors += 1;
      const message = `imap: ${errorText(e)}`;
      await logError('email', message, { account: maskEmail(acc.email) });
      await markFailed(accounts, acc, message).catch(() => logError('email', 'email_accounts: не удалось записать last_error'));
    }
  }
  return NextResponse.json({ ok: true, ...total });
}
