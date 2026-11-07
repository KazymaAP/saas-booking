'use client';

// app/partner/components.tsx — блоки кабинета партнёра в визуальном языке супер-админки.
// Логика прежняя: лиды (CRUD), готовые сайты, выставление счёта. Данные только из БД.
import { useState } from 'react';
import type { PartnerLead, CheckoutVariant, PartnerReadySite } from '@/lib/partners';
import {
  addLeadAction, updateLeadAction, deleteLeadAction, markReferralSentAction,
  createCheckoutAction,
} from './actions';

function CopyButton({ text, label = 'Копировать' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }
        catch { /* буфер недоступен — ничего не ломаем */ }
      }}
      className="btn-secondary press shrink-0 text-caption"
    >
      {done ? 'Скопировано ✓' : label}
    </button>
  );
}

const LEAD_STATUSES: { value: string; label: string; cls: string }[] = [
  { value: 'new', label: 'Новый', cls: 'border-sky-400/30 text-sky-300' },
  { value: 'contacted', label: 'Связались', cls: 'border-amber-400/30 text-amber-300' },
  { value: 'converted', label: 'Конвертирован', cls: 'border-brand-success/30 text-brand-success' },
  { value: 'refused', label: 'Отказ', cls: 'border-brand-error/30 text-brand-error' },
];

export function LeadsManager({ initialLeads }: { initialLeads: PartnerLead[] }) {
  const [leads, setLeads] = useState<PartnerLead[]>(initialLeads);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-heading-sm">База лидов</h2>
          <p className="mt-1 text-caption text-brand-text-muted">Предприниматели, которых вы ведёте.</p>
        </div>
        <button type="button" className="btn-primary press text-body-sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Свернуть форму' : '+ Добавить лида'}
        </button>
      </div>

      {open && (
        <form
          className="grid grid-cols-1 gap-2 rounded-3xl border border-brand-border bg-brand-surface p-4 sm:grid-cols-2"
          action={async (fd: FormData) => {
            const lead = await addLeadAction(fd);
            setLeads((prev) => [lead, ...prev]);
            (document.getElementById('lead-form') as HTMLFormElement | null)?.reset();
            setOpen(false);
          }}
          id="lead-form"
        >
          <input name="name" placeholder="Имя" required className="input" />
          <input name="phone" placeholder="Телефон" className="input" />
          <input name="email" placeholder="Email" className="input" />
          <input name="source" placeholder="Откуда (источник)" className="input" />
          <textarea name="message" placeholder="Заметка" className="input sm:col-span-2" />
          <button className="btn-primary press text-body-sm sm:col-span-2">Добавить лида</button>
        </form>
      )}

      {leads.length === 0 ? (
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
          <p className="text-body-sm text-brand-text-muted">Пока нет лидов.</p>
          <p className="mt-1 text-caption text-brand-text-subtle">Добавьте первого — он появится здесь и в статистике.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => {
            const st = LEAD_STATUSES.find((s) => s.value === lead.status) ?? { label: lead.status, cls: 'border-white/15 text-brand-text-muted' };
            return (
              <li key={lead.id} className="rounded-3xl border border-brand-border bg-brand-surface p-4">
                {editing === lead.id ? (
                  <form
                    action={async (fd: FormData) => {
                      fd.set('id', lead.id);
                      fd.set('status', lead.status);
                      await updateLeadAction(fd);
                      setLeads((prev) => prev.map((l) => (l.id === lead.id ? {
                        ...l,
                        name: String(fd.get('name') ?? ''),
                        phone: String(fd.get('phone') ?? ''),
                        email: String(fd.get('email') ?? ''),
                        message: String(fd.get('message') ?? ''),
                        source: String(fd.get('source') ?? ''),
                      } : l)));
                      setEditing(null);
                    }}
                    className="grid grid-cols-2 gap-2"
                  >
                    <input name="name" defaultValue={lead.name ?? ''} className="input" />
                    <input name="phone" defaultValue={lead.phone ?? ''} className="input" />
                    <input name="email" defaultValue={lead.email ?? ''} className="input" />
                    <input name="source" defaultValue={lead.source ?? ''} className="input" />
                    <textarea name="message" defaultValue={lead.message ?? ''} className="input col-span-2" />
                    <div className="col-span-2 flex gap-2">
                      <button className="btn-primary press text-body-sm">Сохранить</button>
                      <button type="button" className="btn-ghost text-body-sm" onClick={() => setEditing(null)}>Отмена</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body-sm font-medium">{lead.name ?? '—'}</div>
                      <div className="truncate text-caption text-brand-text-subtle">{[lead.phone, lead.email].filter(Boolean).join(' · ') || 'нет контактов'}</div>
                      {lead.message && <div className="mt-1 truncate text-caption text-brand-text-muted">{lead.message}</div>}
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-caption ${st.cls}`}>{st.label}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={lead.status}
                        onChange={async (e) => {
                          const fd = new FormData();
                          fd.set('id', lead.id);
                          fd.set('status', e.target.value);
                          await updateLeadAction(fd);
                          setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: e.target.value } : l)));
                        }}
                        className="input !min-h-9 !py-1.5 text-caption"
                        aria-label={`Статус лида ${lead.name ?? ''}`}
                      >
                        {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <button type="button" onClick={() => setEditing(lead.id)} className="btn-ghost px-2 py-1 text-caption">Изменить</button>
                      <form action={async (fd: FormData) => {
                        fd.set('id', lead.id);
                        await markReferralSentAction(fd);
                        setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: 'contacted', referral_sent_at: new Date().toISOString() } : l)));
                      }}>
                        <button className="btn-secondary press text-caption">Отправил ссылку</button>
                      </form>
                      <form action={async (fd: FormData) => {
                        fd.set('id', lead.id);
                        await deleteLeadAction(fd);
                        setLeads((prev) => prev.filter((l) => l.id !== lead.id));
                      }}>
                        <button className="btn-ghost px-2 py-1 text-caption text-brand-error">Удалить</button>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ReadySites({ sites, onPick }: { sites: PartnerReadySite[]; onPick: (s: PartnerReadySite) => void }) {
  return (
    <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
      <h2 className="text-heading-sm">Готовые сайт-визитки</h2>
      <p className="mt-1 text-caption text-brand-text-muted">
        Платформа подготовила сайты из шаблонов ниш. Возьмите ссылку на подходящий, отправьте предпринимателю и выставьте счёт.
      </p>
      {sites.length === 0 ? (
        <p className="mt-3 text-body-sm text-brand-text-muted">Пока нет готовых сайтов — их добавляет платформа.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sites.map((s) => {
            const url = s.preview_url ?? `https://zapishisya.ru/s/${s.slug}`;
            return (
              <div key={s.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <span className="rounded-full border border-brand-accent/30 bg-brand-accent/10 px-2 py-0.5 text-caption text-brand-accent">{s.niche}</span>
                <p className="mt-2 text-body-sm font-medium">{s.title}</p>
                {s.description && <p className="mt-0.5 text-caption text-brand-text-subtle">{s.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-caption text-brand-accent">{url}</code>
                  <CopyButton text={url} label="Ссылка" />
                </div>
                <button type="button" onClick={() => onPick(s)} className="btn-primary press mt-2 w-full text-body-sm">
                  Выставить счёт для этого сайта
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function PartnerWorkspace({ sites }: { sites: PartnerReadySite[] }) {
  const [picked, setPicked] = useState<PartnerReadySite | null>(null);
  return (
    <div className="space-y-5">
      <ReadySites sites={sites} onPick={setPicked} />
      <CheckoutCreator initialSite={picked} />
    </div>
  );
}

export function CheckoutCreator({ initialSite }: { initialSite: PartnerReadySite | null }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState<CheckoutVariant>('subscription_5000');
  const [custom, setCustom] = useState('');

  const options: { v: CheckoutVariant; t: string; d: string }[] = [
    { v: 'subscription_5000', t: 'Подписка 5 000 ₽/мес', d: 'Клиент платит 5 000 ₽/мес → вы получаете 1 000 ₽/мес' },
    { v: 'code_5000', t: 'Код сайт-визитки 5 000 ₽', d: 'Клиент платит 5 000 ₽ за код → вы получаете 1 000 ₽ разово' },
    { v: 'custom', t: 'Своя сумма', d: 'Вы назначаете цену: платформа 75%, вы 25%' },
  ];

  return (
    <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
      <h2 className="text-heading-sm">Новый счёт для предпринимателя</h2>
      <p className="mt-1 text-caption text-brand-text-muted">Выберите вариант сделки — ссылку на оплату отправите предпринимателю.</p>

      {initialSite && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.06] p-3">
          <span className="text-caption text-brand-accent">Готовый сайт:</span>
          <span className="text-body-sm font-medium">{initialSite.title}</span>
          <CopyButton text={initialSite.preview_url ?? `https://zapishisya.ru/s/${initialSite.slug}`} label="Ссылка" />
        </div>
      )}

      <form
        className="mt-4 space-y-3"
        action={async (fd: FormData) => {
          setBusy(true); setError(null); setResult(null);
          fd.set('variant', variant);
          fd.set('customAmount', custom);
          fd.set('readySiteId', initialSite?.id ?? '');
          const res = await createCheckoutAction(fd);
          setBusy(false);
          if (res.ok) setResult({ url: res.paymentUrl });
          else setError(res.error);
        }}
      >
        <div className="space-y-2">
          {options.map((opt) => (
            <label key={opt.v} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${variant === opt.v ? 'border-brand-accent/50 bg-brand-accent/[0.06]' : 'border-white/[0.06] hover:bg-white/[0.02]'}`}>
              <input type="radio" name="variant" value={opt.v} checked={variant === opt.v} onChange={() => setVariant(opt.v)} className="mt-1" />
              <span>
                <span className="block text-body-sm font-medium">{opt.t}</span>
                <span className="block text-caption text-brand-text-subtle">{opt.d}</span>
              </span>
            </label>
          ))}
        </div>

        {variant === 'custom' && (
          <input
            name="customAmount"
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Сумма, ₽ (например 20000)"
            className="input w-full"
          />
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input name="entrepreneurName" placeholder="Имя предпринимателя" className="input" />
          <input name="entrepreneurEmail" placeholder="Email" className="input" />
          <input name="entrepreneurPhone" placeholder="Телефон" className="input" />
        </div>

        <button disabled={busy} className="btn-primary press text-body-sm disabled:opacity-50">
          {busy ? 'Создаём счёт…' : 'Создать счёт и получить ссылку'}
        </button>
      </form>

      {error && <div className="mt-3 rounded-2xl border border-brand-error/40 bg-brand-error/10 px-3 py-2 text-body-sm text-brand-error">{error}</div>}
      {result && (
        <div className="mt-3 rounded-2xl border border-brand-success/40 bg-brand-success/10 p-3">
          <p className="text-body-sm text-brand-success">Ссылка на оплату готова — отправьте её предпринимателю:</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-caption text-brand-accent">{result.url}</code>
            <CopyButton text={result.url} />
            <a href={result.url} target="_blank" rel="noreferrer" className="btn-secondary press text-caption">Открыть</a>
          </div>
        </div>
      )}
    </section>
  );
}
