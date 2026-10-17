'use client';
// Таблица лицензий с optimistic-обновлением: статус меняется сразу, при ошибке сервера — откат и сообщение.
// Optimistic реализован через useState (useOptimistic в React 18.3 доступен только в canary-типах).
// a11y: <caption>, scope у заголовков, подписи у полей, aria-live для результатов, подтверждение блокировки,
// aria-label с именем бизнеса у кнопок строки (иначе диктор читает десятки одинаковых «Заблокировать»).
import { useState, useTransition } from 'react';
import type { LicenseStatus } from '@/lib/license-client';
import { allowDomain, ignoreSignal, setRevoked, type ActionResult } from './actions';

export type LicenseView = {
  id: string;
  license_id: string;
  business: string | null;
  domains: string[];
  revoked: boolean;
  last_ping: { status: LicenseStatus | null; domain: string; at: string } | null;
  signal_domains: string[];
};

const STATUS_TEXT: Record<LicenseStatus, string> = {
  active: 'Активна',
  unverified: 'Чужой домен',
  unknown: 'Неизвестно',
  blocked: 'Заблокирована',
};
const STATUS_COLOR: Record<LicenseStatus, string> = {
  active: '#16a34a',
  unverified: '#ca8a04',
  unknown: '#6b6b6b',
  blocked: '#dc2626',
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' });
}

function StatusBadge({ status }: { status: LicenseStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_TEXT[status]}
    </span>
  );
}

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

// Состояние строки и optimistic-действия: применить → вызвать action → при ошибке откатить.
function useLicenseRow(l: LicenseView, onResult: (r: ActionResult) => void) {
  const [revoked, setRevokedLocal] = useState(l.revoked);
  const [domains, setDomains] = useState(l.domains);
  const [signals, setSignals] = useState(l.signal_domains);
  const [newDomain, setNewDomain] = useState('');
  const [pending, startTransition] = useTransition();

  function run(apply: () => void, rollback: () => void, action: () => Promise<ActionResult>) {
    apply();
    startTransition(async () => {
      const r = await action().catch((): ActionResult => ({ ok: false, message: 'Сеть недоступна' }));
      if (!r.ok) rollback();
      onResult(r);
    });
  }

  function toggleRevoked() {
    const next = !revoked;
    const label = l.business ?? l.license_id.slice(0, 8);
    if (next && !window.confirm(`Заблокировать лицензию «${label}»? Сайт клиента покажет заглушку после следующего ping.`)) return;
    run(() => setRevokedLocal(next), () => setRevokedLocal(!next), () => setRevoked(form({ id: l.id, revoked: next ? '1' : '0' })));
  }

  function addDomain(d: string) {
    const host = d.trim().toLowerCase();
    if (!host) return;
    const prevDomains = domains;
    const prevSignals = signals;
    run(
      () => { setDomains(Array.from(new Set([...domains, host]))); setSignals(signals.filter((s) => s !== host)); setNewDomain(''); },
      () => { setDomains(prevDomains); setSignals(prevSignals); },
      () => allowDomain(form({ id: l.id, domain: host })),
    );
  }

  function ignore() {
    const prev = signals;
    run(() => setSignals([]), () => setSignals(prev), () => ignoreSignal(form({ id: l.id })));
  }

  return { revoked, domains, signals, newDomain, setNewDomain, pending, toggleRevoked, addDomain, ignore };
}

function Row({ l, onResult }: { l: LicenseView; onResult: (r: ActionResult) => void }) {
  const r = useLicenseRow(l, onResult);
  const label = l.business ?? l.license_id;
  return (
    <tr className="border-b border-[#e5e5e5] align-top" aria-busy={r.pending}>
      <th scope="row" className="p-2 text-left font-normal">
        <div>{l.business ?? '—'}</div>
        <div className="mt-1"><StatusBadge status={r.revoked ? 'blocked' : l.last_ping?.status ?? 'unknown'} /></div>
      </th>
      <td className="p-2 break-all font-mono text-[12px]">{l.license_id}</td>
      <td className="p-2">{r.domains.length ? r.domains.join(', ') : <span className="text-[#666666]">не привязан</span>}</td>
      <td className="p-2">
        <PingInfo ping={l.last_ping} />
        <Signals signals={r.signals} label={label} pending={r.pending} onAllow={r.addDomain} onIgnore={r.ignore} />
      </td>
      <td className="p-2">
        <div className="flex flex-col gap-2">
          <button type="button" className={r.revoked ? 'underline' : 'underline text-[#dc2626]'} disabled={r.pending} onClick={r.toggleRevoked}
            aria-label={`${r.revoked ? 'Разблокировать' : 'Заблокировать'} лицензию ${label}`}>
            {r.revoked ? 'Разблокировать' : 'Заблокировать'}
          </button>
          <AllowDomainForm id={l.id} label={label} value={r.newDomain} pending={r.pending} onChange={r.setNewDomain} onSubmit={r.addDomain} />
        </div>
      </td>
    </tr>
  );
}

function PingInfo({ ping }: { ping: LicenseView['last_ping'] }) {
  if (!ping) return <span className="text-[#666666]">нет за 30 дней</span>;
  return (
    <>
      <div>{ping.status ? STATUS_TEXT[ping.status] : '—'} · {ping.domain}</div>
      <time dateTime={ping.at} className="text-[12px] text-[#666666]">{fmt(ping.at)}</time>
    </>
  );
}

type SignalsProps = { signals: string[]; label: string; pending: boolean; onAllow: (d: string) => void; onIgnore: () => void };

// Сигнал о запуске на чужом домене: разрешить конкретный домен или скрыть сигналы до следующего.
function Signals({ signals, label, pending, onAllow, onIgnore }: SignalsProps) {
  if (signals.length === 0) return null;
  return (
    <div className="mt-2 grid gap-1 rounded-md bg-[#fef9c3] p-2 text-[13px]" role="note">
      <span>Сигнал: запуск на {signals.join(', ')}</span>
      <div className="flex flex-wrap gap-3">
        {signals.map((s) => (
          <button key={s} type="button" className="underline" disabled={pending} onClick={() => onAllow(s)}>Разрешить {s}</button>
        ))}
        <button type="button" className="underline text-[#666666]" disabled={pending} onClick={onIgnore} aria-label={`Игнорировать сигналы лицензии ${label}`}>Игнорировать</button>
      </div>
    </div>
  );
}

type AllowFormProps = { id: string; label: string; value: string; pending: boolean; onChange: (v: string) => void; onSubmit: (v: string) => void };

function AllowDomainForm({ id, label, value, pending, onChange, onSubmit }: AllowFormProps) {
  const inputId = `allow-${id}`;
  return (
    <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); onSubmit(value); }}>
      <label htmlFor={inputId} className="sr-only">Разрешить домен для {label}</label>
      <input id={inputId} value={value} onChange={(e) => onChange(e.target.value)} placeholder="разрешить домен" className="input h-9" autoComplete="off" />
      <button className="underline" type="submit" disabled={pending || !value.trim()} aria-label={`Добавить домен для ${label}`}>Добавить</button>
    </form>
  );
}

export function LicensesTable({ licenses }: { licenses: LicenseView[] }) {
  const [last, setLast] = useState<ActionResult | null>(null);
  if (licenses.length === 0) return <p className="text-[#666666]">Лицензий пока нет. Выдайте первую выше.</p>;
  return (
    <>
      <p role="status" aria-live="polite" className={`min-h-[20px] text-[14px] ${last?.ok ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
        {last?.message ?? ''}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <caption className="sr-only">Лицензии: бизнес, ключ, домены, последний ping и действия</caption>
          <thead>
            <tr className="border-b border-[#e5e5e5] text-[#666666]">
              <th scope="col" className="p-2 font-normal">Бизнес и статус</th>
              <th scope="col" className="p-2 font-normal">license_id</th>
              <th scope="col" className="p-2 font-normal">Домены</th>
              <th scope="col" className="p-2 font-normal">Последний ping</th>
              <th scope="col" className="p-2 font-normal">Действия</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((l) => <Row key={l.id} l={l} onResult={setLast} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}
