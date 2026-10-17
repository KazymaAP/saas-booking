'use client';
// app/panel/(protected)/email-accounts/AccountsClient.tsx — список ящиков и форма (ТЗ §4.16).
// Вкл/выкл и сброс лимита — optimistic: интерфейс меняется сразу, при ошибке сервера откатывается
// (useOptimistic возвращается к серверным данным после завершения transition).
import { useOptimistic, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { PublicEmailAccount } from '@/lib/email-accounts';
import {
  deleteEmailAccount, resetEmailLimit, saveEmailAccount, sendTestEmail, setEmailAccountActive, testEmailAccount, type ActionState,
} from './actions';

type Patch = { id: string; active?: boolean; sent_today?: number; removed?: boolean };
const INITIAL: ActionState = { ok: true, message: '' };

function applyPatch(list: PublicEmailAccount[], p: Patch): PublicEmailAccount[] {
  if (p.removed) return list.filter((a) => a.id !== p.id);
  return list.map((a) => (a.id === p.id ? { ...a, ...(p.active === undefined ? {} : { active: p.active }), ...(p.sent_today === undefined ? {} : { sent_today: p.sent_today }) } : a));
}

function Status({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? 'status' : 'alert'} aria-live="polite" className={`rounded-md p-3 text-[14px] ${state.ok ? 'bg-[#f0fdf4] text-[#166534]' : 'bg-[#fef2f2] text-[#b91c1c]'}`}>
      {state.message}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-fit" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Сохраняю…' : label}</button>;
}

function Field({ id, label, hint, ...input }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="grid gap-1">
      <span>{label}</span>
      <input id={id} className="input" aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && <span id={`${id}-hint`} className="text-[12px] text-[#666666]">{hint}</span>}
    </label>
  );
}

function SecureSelect({ id, name, value }: { id: string; name: string; value: string | null }) {
  return (
    <label htmlFor={id} className="grid gap-1">
      <span>Шифрование</span>
      <select id={id} name={name} defaultValue={value ?? 'tls'} className="input">
        <option value="tls">TLS (465 / 993)</option>
        <option value="starttls">STARTTLS (587 / 143)</option>
      </select>
    </label>
  );
}

function AccountForm({ account, onDone }: { account: PublicEmailAccount | null; onDone: () => void }) {
  const [state, action] = useFormState(async (prev: ActionState, fd: FormData) => {
    const r = await saveEmailAccount(prev, fd);
    if (r.ok) onDone();
    return r;
  }, INITIAL);
  const p = account ? `acc-${account.id}` : 'acc-new';
  const passHint = account ? (account.has_smtp_pass ? 'Пароль сохранён. Оставьте пустым, чтобы не менять.' : 'Пароль не задан.') : 'Пароль приложения Yandex 360, не пароль от аккаунта.';
  return (
    <form action={action} className="grid max-w-[640px] gap-3 text-[14px]" aria-labelledby={`${p}-title`}>
      <h2 id={`${p}-title`} className="text-[18px] font-semibold">{account ? `Изменить ${account.email}` : 'Добавить ящик'}</h2>
      <input type="hidden" name="id" value={account?.id ?? ''} />
      <Field id={`${p}-email`} name="email" type="email" label="Адрес ящика" defaultValue={account?.email ?? ''} required autoComplete="off" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${p}-from`} name="from_name" label="Имя отправителя" defaultValue={account?.from_name ?? ''} maxLength={80} />
        <Field id={`${p}-reply`} name="reply_to" type="email" label="Адрес для ответов (необязательно)" defaultValue={account?.reply_to ?? ''} />
      </div>
      <Field id={`${p}-pass`} name="smtp_pass" type="password" label="Пароль приложения (SMTP)" hint={passHint} required={!account} autoComplete="new-password" />
      <fieldset className="grid gap-3 rounded-md border border-[#e5e5e5] p-3 sm:grid-cols-3">
        <legend className="px-1 font-medium">SMTP</legend>
        <Field id={`${p}-smtp-host`} name="smtp_host" label="Сервер" defaultValue={account?.smtp_host ?? 'smtp.yandex.ru'} />
        <Field id={`${p}-smtp-port`} name="smtp_port" type="number" min={1} max={65535} label="Порт" defaultValue={account?.smtp_port ?? 465} />
        <SecureSelect id={`${p}-smtp-secure`} name="smtp_secure" value={account?.smtp_secure ?? null} />
      </fieldset>
      <fieldset className="grid gap-3 rounded-md border border-[#e5e5e5] p-3 sm:grid-cols-3">
        <legend className="px-1 font-medium">IMAP (приём ответов)</legend>
        <Field id={`${p}-imap-host`} name="imap_host" label="Сервер" defaultValue={account?.imap_host ?? 'imap.yandex.ru'} />
        <Field id={`${p}-imap-port`} name="imap_port" type="number" min={1} max={65535} label="Порт" defaultValue={account?.imap_port ?? 993} />
        <SecureSelect id={`${p}-imap-secure`} name="imap_secure" value={account?.imap_secure ?? null} />
        <div className="sm:col-span-3">
          <Field id={`${p}-imap-pass`} name="imap_pass" type="password" label="Отдельный пароль IMAP" hint="Пусто — используется пароль SMTP." autoComplete="new-password" />
        </div>
      </fieldset>
      <Field id={`${p}-limit`} name="daily_limit" type="number" min={1} max={500} label="Лимит писем в день" defaultValue={account?.daily_limit ?? 50} />
      <SubmitButton label={account ? 'Сохранить изменения' : 'Добавить ящик'} />
      <Status state={state} />
    </form>
  );
}

function AccountRow({ a, run, onEdit }: { a: PublicEmailAccount; run: (p: Patch | null, call: () => Promise<ActionState>) => void; onEdit: () => void }) {
  const [to, setTo] = useState('');
  const usage = a.daily_limit > 0 ? Math.min(100, Math.round((a.sent_today / a.daily_limit) * 100)) : 0;
  return (
    <li className="grid gap-3 rounded-md border border-[#e5e5e5] p-3" aria-labelledby={`acc-${a.id}-name`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <span id={`acc-${a.id}-name`} className="font-medium">{a.from_name ? `${a.from_name} · ` : ''}{a.email}</span>
          <span className="text-[#666666]">
            <span className={a.active ? 'text-[#166534]' : 'text-[#b91c1c]'}>{a.active ? 'активен' : 'выключен'}</span>
            {' · '}сегодня {a.sent_today} из {a.daily_limit}
            {a.last_checked_at && ` · проверен ${new Date(a.last_checked_at).toLocaleString('ru-RU')}`}
          </span>
          <progress max={100} value={usage} aria-label={`Использовано ${usage}% дневного лимита`} className="h-1 w-[200px]" />
          {a.last_error && <span role="note" className="text-[#b91c1c]">Последняя ошибка: {a.last_error}</span>}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="underline" aria-pressed={a.active} onClick={() => run({ id: a.id, active: !a.active }, () => setEmailAccountActive(a.id, !a.active))}>
            {a.active ? 'Выключить' : 'Включить'}
          </button>
          <button type="button" className="underline" onClick={() => run({ id: a.id, sent_today: 0 }, () => resetEmailLimit(a.id))}>Сбросить лимит</button>
          <button type="button" className="underline" onClick={onEdit} aria-label={`Изменить ящик ${a.email}`}>Изменить</button>
          <button
            type="button"
            className="underline text-[#dc2626]"
            onClick={() => window.confirm(`Удалить ящик ${a.email}?`) && run({ id: a.id, removed: true }, () => deleteEmailAccount(a.id))}
          >Удалить</button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className="h-9 rounded-md border border-[#e5e5e5] px-3" onClick={() => run(null, () => testEmailAccount(a.id))}>Проверить SMTP и IMAP</button>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(null, () => sendTestEmail(a.id, to)); }}>
          <label htmlFor={`acc-${a.id}-test`} className="sr-only">Адрес для тестового письма с {a.email}</label>
          <input id={`acc-${a.id}-test`} type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="Кому тестовое письмо" className="input h-9 w-[240px]" />
          <button type="submit" className="h-9 rounded-md border border-[#e5e5e5] px-3">Отправить тест</button>
        </form>
      </div>
    </li>
  );
}

export function AccountsClient({ accounts }: { accounts: PublicEmailAccount[] }) {
  const [optimistic, apply] = useOptimistic(accounts, applyPatch);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>(INITIAL);
  const [editing, setEditing] = useState<string | null>(null);

  function run(patch: Patch | null, call: () => Promise<ActionState>) {
    startTransition(async () => {
      if (patch) apply(patch);
      try {
        setState(await call());
      } catch {
        setState({ ok: false, message: 'Сервер недоступен, изменение не сохранено' });
      }
    });
  }

  const editAccount = optimistic.find((a) => a.id === editing) ?? null;
  return (
    <div className="grid gap-8">
      <section aria-labelledby="accounts-list-title" aria-busy={pending} className="grid gap-3">
        <h2 id="accounts-list-title" className="text-[18px] font-semibold">Ящики ({optimistic.length})</h2>
        <Status state={state} />
        {optimistic.length === 0 && <p className="text-[14px] text-[#666666]">Ящиков пока нет — письма не отправляются.</p>}
        <ul className="grid gap-3 text-[14px]">
          {optimistic.map((a) => <AccountRow key={a.id} a={a} run={run} onEdit={() => setEditing(a.id)} />)}
        </ul>
      </section>
      <section className="grid gap-2">
        {editAccount && <button type="button" className="w-fit text-[14px] underline" onClick={() => setEditing(null)}>Отменить правку и добавить новый ящик</button>}
        <AccountForm key={editAccount?.id ?? 'new'} account={editAccount} onDone={() => setEditing(null)} />
      </section>
    </div>
  );
}
