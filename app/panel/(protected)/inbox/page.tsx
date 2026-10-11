// app/panel/(protected)/inbox/page.tsx — входящие: фильтры, нити по отправителю, ответ, прототип (ТЗ §5.4).
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { markInboxRead, replyToIncoming } from './actions';

export const dynamic = 'force-dynamic';

export default async function InboxPage({ searchParams }: { searchParams: { filter?: string } }) {
  const unreadOnly = searchParams.filter === 'unread';
  let q = adminClient()
    .from('emails_incoming')
    .select('id, from_email, subject, body_text, received_at, is_read, business_id, businesses(name, slug, preview_url, vertical_templates(url_prefix))')
    .order('received_at', { ascending: false })
    .limit(200);
  if (unreadOnly) q = q.eq('is_read', false);
  const { data } = await q;

  // Нити: группируем по отправителю, внутри — по времени
  const threads = new Map<string, any[]>();
  for (const m of (data ?? []) as any[]) {
    const key = m.from_email ?? 'unknown';
    threads.set(key, [...(threads.get(key) ?? []), m]);
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-semibold">Входящие</h1>
        <div className="flex gap-3 text-[14px]">
          <Link className={unreadOnly ? 'text-[#666666] underline' : 'font-semibold underline'} href="?">Все</Link>
          <Link className={unreadOnly ? 'font-semibold underline' : 'text-[#666666] underline'} href="?filter=unread">Непрочитанные</Link>
        </div>
      </div>

      {[...threads.entries()].map(([from, msgs]) => {
        const first = msgs[0];
        const biz = first.businesses;
        const prototype = biz?.preview_url ?? null;
        return (
          <section key={from} className="grid gap-3 rounded-md border border-[#e5e5e5] p-4">
            <div className="flex flex-wrap justify-between gap-2 text-[14px]">
              <span className="font-medium">{biz?.name ?? from}</span>
              <span className="flex gap-3">
                {prototype && <a className="underline" href={prototype} target="_blank" rel="noreferrer">Открыть прототип</a>}
                {biz?.slug && <Link className="underline" href={`/panel/businesses/${first.business_id}`}>Карточка</Link>}
              </span>
            </div>
            {msgs.map((m: any) => (
              <div key={m.id} className={`rounded-md p-3 text-[14px] ${m.is_read ? '' : 'bg-[#f5f5f5]'}`}>
                <div className="flex flex-wrap justify-between gap-2 text-[#666666]">
                  <span>{m.subject}</span>
                  <span>{new Date(m.received_at).toLocaleString('ru-RU')}</span>
                </div>
                <p className="mt-2 whitespace-pre-line">{m.body_text}</p>
                <form action={markInboxRead} className="mt-2">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="read" value={m.is_read ? '0' : '1'} />
                  <button className="underline" type="submit">{m.is_read ? 'Пометить непрочитанным' : 'Пометить прочитанным'}</button>
                </form>
              </div>
            ))}
            <form action={replyToIncoming} className="grid gap-2 text-[14px]">
              <input type="hidden" name="id" value={first.id} />
              <textarea name="text" placeholder="Ответ клиенту" className="input h-[90px] py-2" required />
              <button className="btn-primary w-fit" type="submit">Ответить</button>
            </form>
          </section>
        );
      })}
      {threads.size === 0 && <p className="text-[14px] text-[#666666]">Ответов пока нет.</p>}
    </div>
  );
}
