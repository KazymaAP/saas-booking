'use client';
// app/panel/(protected)/inbox/InboxThread.tsx — карточка нити: письма, отметки прочитано/непрочитано, ответ (ТЗ §13.4).
// Отметки — optimistic: подсветка непрочитанного меняется сразу, при ошибке возвращается состояние сервера.
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { replyToIncoming, setRead, type InboxActionState } from './actions';

export type MessageView = { id: string; from: string; subject: string; text: string; receivedAt: string | null; isRead: boolean; attachments: string[] };
export type ThreadView = {
  key: string; title: string; businessId: string | null; prototypeUrl: string | null;
  unread: number; answered: boolean; replyToId: string; messages: MessageView[];
};

const INITIAL: InboxActionState = { ok: true, message: '' };

function Status({ state }: { state: InboxActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? 'status' : 'alert'} aria-live="polite" className={state.ok ? 'text-[#166534]' : 'text-[#b91c1c]'}>{state.message}</p>;
}

function ReplyButton() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-fit" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Отправляю…' : 'Ответить'}</button>;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : '';
}

function MessageList({ messages, onMark }: { messages: MessageView[]; onMark: (ids: string[], read: boolean) => void }) {
  return (
    <ol className="grid gap-2">
      {messages.map((m) => (
        <li key={m.id} className={`rounded-md p-3 ${m.isRead ? 'border border-[#f0f0f0]' : 'bg-[#f5f5f5]'}`} aria-label={`${m.isRead ? 'Прочитано' : 'Не прочитано'}: ${m.subject}`}>
          <div className="flex flex-wrap justify-between gap-2 text-[#666666]">
            <span>{m.from} · {m.subject}</span>
            <time dateTime={m.receivedAt ?? undefined}>{formatDate(m.receivedAt)}</time>
          </div>
          <p className="mt-2 whitespace-pre-line break-words">{m.text}</p>
          {m.attachments.length > 0 && <p className="mt-2 text-[#666666]">Вложения: {m.attachments.join(', ')}</p>}
          <button type="button" className="mt-2 underline" onClick={() => onMark([m.id], !m.isRead)}>
            {m.isRead ? 'Пометить непрочитанным' : 'Отметить прочитанным'}
          </button>
        </li>
      ))}
    </ol>
  );
}

function ReplyForm({ replyToId }: { replyToId: string }) {
  const [state, action] = useFormState(replyToIncoming, INITIAL);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={replyToId} />
      <label htmlFor={`reply-${replyToId}`} className="font-medium">Ответ (уйдёт с того же ящика, на который пришло письмо)</label>
      <textarea id={`reply-${replyToId}`} name="text" className="input h-[110px] py-2" required minLength={2} maxLength={5000} />
      <ReplyButton />
      <Status state={state} />
    </form>
  );
}

export function InboxThreadCard({ thread }: { thread: ThreadView }) {
  const [messages, setOptimistic] = useOptimistic(thread.messages, (list: MessageView[], p: { ids: string[]; read: boolean }) =>
    list.map((m) => (p.ids.includes(m.id) ? { ...m, isRead: p.read } : m)));
  const [, startTransition] = useTransition();
  const [markState, setMarkState] = useState<InboxActionState>(INITIAL);
  const headingId = `thread-${thread.replyToId}-title`;
  const unread = messages.filter((m) => !m.isRead).length;

  function mark(ids: string[], read: boolean) {
    startTransition(async () => {
      setOptimistic({ ids, read });
      setMarkState(await setRead(ids, read).catch(() => ({ ok: false, message: 'Сервер недоступен' })));
    });
  }

  return (
    <article className="grid gap-3 rounded-md border border-[#e5e5e5] p-4 text-[14px]" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-[16px] font-medium">
          {thread.title}
          {unread > 0 && <span className="ml-2 rounded-full bg-[#111111] px-2 text-[12px] text-white">{unread} новых</span>}
          {thread.answered && <span className="ml-2 text-[12px] text-[#166534]">отвечено</span>}
        </h2>
        <div className="flex flex-wrap gap-3">
          {thread.prototypeUrl && <a className="underline" href={thread.prototypeUrl} target="_blank" rel="noopener noreferrer">Открыть прототип<span className="sr-only"> (в новой вкладке)</span></a>}
          {thread.businessId && <Link className="underline" href={`/panel/businesses/${thread.businessId}`}>Карточка бизнеса</Link>}
          <button type="button" className="underline" onClick={() => mark(messages.map((m) => m.id), unread > 0)}>
            {unread > 0 ? 'Отметить нить прочитанной' : 'Пометить нить непрочитанной'}
          </button>
        </div>
      </header>
      <Status state={markState} />
      <MessageList messages={messages} onMark={mark} />
      <ReplyForm replyToId={thread.replyToId} />
    </article>
  );
}
