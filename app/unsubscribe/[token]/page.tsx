// app/unsubscribe/[token]/page.tsx — страница отписки по ссылке из письма (ТЗ 4.0 §9.5, §15.7; 38-ФЗ ст. 18).
// Первый визит сразу оформляет отписку (DoD задачи 8): лишняя отписка (например, от сканера ссылок) безопасна,
// а лишнее письмо — нарушение. Повторные визиты идемпотентны. Затем можно указать причину — необязательно.
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  UNSUBSCRIBE_REASONS, UNSUBSCRIBE_REASON_LABELS, logLegalError, maskEmail, parseUnsubscribeToken, unsubscribeEmail,
  type UnsubscribeResult,
} from '@/lib/legal';
import { confirmUnsubscribe, saveUnsubscribeReason, type UnsubscribePageStatus } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Отписка от писем',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

type Props = { params: { token: string }; searchParams: { status?: string } };

const PAGE_STATUSES: readonly UnsubscribePageStatus[] = ['done', 'already', 'reason_saved', 'error', 'rate_limited', 'forbidden'];

function pageStatus(value: string | undefined): UnsubscribePageStatus | null {
  return PAGE_STATUSES.find((s) => s === value) ?? null;
}

async function unsubscribeOnVisit(email: string): Promise<UnsubscribeResult> {
  try {
    const result = await unsubscribeEmail(email, 'page');
    if (!result.ok) await logLegalError('unsubscribe: ошибка записи', { email: maskEmail(email), source: 'page' });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'неизвестная ошибка';
    await logLegalError(`unsubscribe: ${message}`, { email: maskEmail(email), source: 'page' });
    return { ok: false, reason: 'server' };
  }
}

export default async function UnsubscribePage({ params, searchParams }: Props) {
  const email = parseUnsubscribeToken(params.token);
  if (!email) return <InvalidToken />;

  // После действия формы (PRG) состояние приходит в ?status=, повторную запись не делаем.
  const from_action = pageStatus(searchParams.status);
  let status: UnsubscribePageStatus;
  if (from_action) {
    status = from_action;
  } else {
    const result = await unsubscribeOnVisit(email);
    if (!result.ok) status = 'error';
    else status = result.already ? 'already' : 'done';
  }

  const retry = confirmUnsubscribe.bind(null, params.token);
  const save_reason = saveUnsubscribeReason.bind(null, params.token);

  return (
    <Shell>
      <StatusMessage status={status} masked={maskEmail(email)} />
      {(status === 'error' || status === 'forbidden' || status === 'rate_limited') && (
        <form action={retry} className="mt-6">
          <button type="submit" className="btn-primary min-h-[44px]">Повторить отписку</button>
        </form>
      )}
      {(status === 'done' || status === 'already') && <ReasonForm action={save_reason} />}
    </Shell>
  );
}

function StatusMessage({ status, masked }: { status: UnsubscribePageStatus; masked: string }) {
  const texts: Record<UnsubscribePageStatus, { title: string; body: string }> = {
    done: { title: 'Вы отписаны', body: `Адрес ${masked} больше не получит от нас деловых предложений.` },
    already: { title: 'Вы уже отписаны', body: `Адрес ${masked} уже в списке отказов, письма на него не отправляются.` },
    reason_saved: { title: 'Спасибо', body: 'Причина сохранена. Отписка действует, писем больше не будет.' },
    error: { title: 'Не удалось оформить отписку', body: 'Произошёл технический сбой. Нажмите «Повторить» или воспользуйтесь формой запроса — мы отпишем вас вручную.' },
    rate_limited: { title: 'Слишком много попыток', body: 'Подождите час и повторите или воспользуйтесь формой запроса.' },
    forbidden: { title: 'Не удалось проверить запрос', body: 'Обновите страницу и повторите.' },
  };
  const text = texts[status];
  const is_problem = status === 'error' || status === 'rate_limited' || status === 'forbidden';
  return (
    <div role={is_problem ? 'alert' : 'status'} data-testid="unsubscribe-status" data-status={status}>
      <h1 className="text-[28px] font-bold leading-tight">{text.title}</h1>
      <p className="mt-3 leading-relaxed">{text.body}</p>
    </div>
  );
}

function ReasonForm({ action }: { action: (form: FormData) => Promise<never> }) {
  return (
    <form action={action} className="mt-8 grid gap-3 rounded-md border border-[#e5e5e5] p-4">
      <fieldset className="grid gap-1">
        <legend className="font-semibold">Почему вы отписались? Необязательно.</legend>
        {UNSUBSCRIBE_REASONS.map((reason) => (
          <label key={reason} className="flex min-h-[44px] items-center gap-3">
            <input type="radio" name="reason" value={reason} className="h-5 w-5" />
            <span>{UNSUBSCRIBE_REASON_LABELS[reason]}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" className="btn-primary min-h-[44px] justify-self-start">Отправить</button>
    </form>
  );
}

function InvalidToken() {
  return (
    <Shell>
      <div role="alert" data-testid="unsubscribe-status" data-status="invalid">
        <h1 className="text-[28px] font-bold leading-tight">Ссылка недействительна</h1>
        <p className="mt-3 leading-relaxed">
          Ссылка повреждена или устарела. Чтобы гарантированно отказаться от писем, отправьте запрос через форму —
          выберите «Больше не присылать мне письма». Отписка оформится сразу.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="mx-auto max-w-[560px] px-4 py-10">
      {children}
      <p className="mt-8 text-[14px]">
        <Link href="/data-request" className="underline">Форма запроса о персональных данных</Link>
        {' · '}
        <Link href="/privacy" className="underline">Политика обработки персональных данных</Link>
      </p>
    </main>
  );
}
