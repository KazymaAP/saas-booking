// app/panel/(protected)/inbox/page.tsx — входящие: нити по thread_id, фильтры, ответ, прототип (ТЗ §13.4).
// HTML писем не выводится: в разметку идёт только body_text (React экранирует) — никакого исполнения
// чужого HTML в админке, даже санитайзенного.
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { logError } from '@/lib/log';
import { filterThreads, groupThreads, parseInboxFilter, type InboxFilter, type InboxMessage } from '@/lib/email-panel';
import { InboxThreadCard, type ThreadView } from './InboxThread';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Входящие' };

const MAX_MESSAGES = 300;
const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'unread', label: 'Непрочитанные' },
  { key: 'answered', label: 'Отвеченные' },
  { key: 'all', label: 'Все' },
];

type BizJoin = { name: string | null; preview_url: string | null };
type Row = InboxMessage & { body_text: string | null; attachments: { filename: string }[] | null; businesses: BizJoin | BizJoin[] | null };

function biz(row: Row): BizJoin | null {
  return Array.isArray(row.businesses) ? row.businesses[0] ?? null : row.businesses;
}

async function loadMessages(): Promise<{ rows: Row[]; failed: boolean }> {
  const { data, error } = await adminClient().from('emails_incoming')
    .select('id, thread_id, message_id, from_email, subject, body_text, received_at, is_read, business_id, email_account_id, attachments, businesses(name, preview_url)')
    .order('received_at', { ascending: false }).limit(MAX_MESSAGES);
  if (error) {
    await logError('email', `inbox page: ${error.message}`);
    return { rows: [], failed: true };
  }
  return { rows: (data ?? []) as unknown as Row[], failed: false };
}

// Message-ID входящих, на которые поставлен (или уже ушёл) ответ.
async function loadAnswered(messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const { data, error } = await adminClient().from('email_queue').select('in_reply_to')
    .in('in_reply_to', messageIds).in('status', ['pending', 'sending', 'sent']).limit(messageIds.length * 2);
  if (error) {
    await logError('email', `inbox answered: ${error.message}`);
    return new Set();
  }
  return new Set(((data ?? []) as { in_reply_to: string | null }[]).map((r) => r.in_reply_to ?? '').filter(Boolean));
}

function toView(t: ReturnType<typeof groupThreads<Row>>[number]): ThreadView {
  const first = t.messages[0];
  const b = first ? biz(first) : null;
  return {
    key: t.key,
    title: b?.name ?? first?.from_email ?? 'Неизвестный отправитель',
    businessId: first?.business_id ?? null,
    prototypeUrl: b?.preview_url ?? null,
    unread: t.unread,
    answered: t.answered,
    replyToId: t.messages[t.messages.length - 1]?.id ?? '',
    messages: t.messages.map((m) => ({
      id: m.id, from: m.from_email ?? '', subject: m.subject ?? '(без темы)', text: m.body_text ?? '',
      receivedAt: m.received_at, isRead: m.is_read, attachments: (m.attachments ?? []).map((a) => a.filename),
    })),
  };
}

export default async function InboxPage({ searchParams }: { searchParams: { filter?: string } }) {
  const filter = parseInboxFilter(searchParams.filter ?? 'all');
  const { rows, failed } = await loadMessages();
  const answered = await loadAnswered(rows.map((r) => r.message_id ?? '').filter(Boolean));
  const all = groupThreads(rows, answered);
  const threads = filterThreads(all, filter).map(toView);
  const unreadTotal = all.filter((t) => t.unread > 0).length;

  return (
    <main id="inbox-page" className="grid gap-6" aria-labelledby="inbox-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="inbox-title" className="text-[24px] font-semibold">Входящие</h1>
        <nav aria-label="Фильтр писем" className="flex gap-3 text-[14px]">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`?filter=${f.key}`}
              aria-current={filter === f.key ? 'page' : undefined}
              className={filter === f.key ? 'font-semibold underline' : 'text-[#666666] underline'}
            >
              {f.label}{f.key === 'unread' && unreadTotal > 0 ? ` (${unreadTotal})` : ''}
            </Link>
          ))}
        </nav>
      </header>
      {failed && <p role="alert" className="rounded-md bg-[#fef2f2] p-3 text-[14px] text-[#b91c1c]">Не удалось загрузить письма. Ошибка записана в журнал.</p>}
      <p className="sr-only" role="status">Нитей: {threads.length}</p>
      {threads.map((t) => <InboxThreadCard key={t.key} thread={t} />)}
      {!failed && threads.length === 0 && <p className="text-[14px] text-[#666666]">Писем в этом разделе нет.</p>}
    </main>
  );
}
