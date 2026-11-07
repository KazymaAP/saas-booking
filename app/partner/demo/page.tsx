'use client';

// app/partner/demo/page.tsx — демонстрация кабинета партнёра без базы данных.
// Нужна, чтобы показать интерфейс до подключения Supabase (и для предпросмотра в админке).
// Логика расчёта комиссий — та же, что в боевом кабинете. Все действия локальные.
import { useState } from 'react';
import {
  SquaresFour, Briefcase, UsersThree, Receipt, ChatCircle, List, X, CheckCircle, WarningCircle,
  CurrencyRub, UserPlus, Copy,
} from '@phosphor-icons/react';

// Демо повторяет боевой кабинет: 8 разделов, таблица готовых сервисов с данными парсера,
// копирование текста, выбор фото, начисления, второй уровень рефералки и материалы.
// Все действия локальные, серверные экшены здесь не вызываются.

type ReadySite = {
  id: string; niche: string; title: string; url: string; desc: string;
  city: string; phone: string; rating: number; reviews: number;
  photos: string[]; refusals: number; noAnswer: number; assigned: boolean;
};
type Lead = { id: string; name: string; phone: string; email: string; status: string };
type Variant = 'subscription_5000' | 'code_5000' | 'custom';
type Checkout = {
  id: string; variant: Variant; amount: number; commission: number;
  commissionType: 'recurring_monthly' | 'one_time'; entrepreneur: string;
  site: string; status: 'awaiting_payment' | 'paid';
};

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

function computeDeal(variant: Variant, custom?: number) {
  if (variant === 'subscription_5000') return { amount: 5000, commission: 1000, commissionType: 'recurring_monthly' as const };
  if (variant === 'code_5000') return { amount: 5000, commission: 1000, commissionType: 'one_time' as const };
  const amt = Number(custom) || 0;
  return { amount: amt, commission: Math.round(amt * 0.25), commissionType: 'one_time' as const };
}

const STATUSES = [
  { v: 'new', t: 'Новый', cls: 'border-sky-400/30 text-sky-300' },
  { v: 'contacted', t: 'Связались', cls: 'border-amber-400/30 text-amber-300' },
  { v: 'converted', t: 'Конвертирован', cls: 'border-brand-success/30 text-brand-success' },
  { v: 'refused', t: 'Отказ', cls: 'border-brand-error/30 text-brand-error' },
];

const COVERS = [
  '/media/covers/detailing.svg',
  '/media/covers/beauty.svg',
  '/media/covers/dentist.svg',
];

const READY_SITES: ReadySite[] = [
  { id: 's1', niche: 'Автосервис', title: 'Автосервис «Гараж»', url: 'https://zapishisya.ru/s/avtoservis-garazh', desc: 'Запись на ремонт и ТО', city: 'Екатеринбург', phone: '+7 912 000-11-22', rating: 4.6, reviews: 38, photos: COVERS, refusals: 0, noAnswer: 0, assigned: false },
  { id: 's2', niche: 'Красота', title: 'Салон красоты «Локон»', url: 'https://zapishisya.ru/s/salon-lokon', desc: 'Запись к мастерам', city: 'Москва', phone: '+7 916 333-44-55', rating: 4.9, reviews: 112, photos: [COVERS[1], COVERS[0]], refusals: 1, noAnswer: 0, assigned: false },
  { id: 's3', niche: 'Фитнес', title: 'Студия йоги «Дыши»', url: 'https://zapishisya.ru/s/studio-dyshi', desc: 'Абонементы и классы', city: 'Казань', phone: '+7 987 222-33-44', rating: 5.0, reviews: 64, photos: [COVERS[2]], refusals: 0, noAnswer: 2, assigned: false },
];

const MOCK_MESSAGE = (r: ReadySite) =>
  `Здравствуйте! Это «${r.title}»? Меня зовут Демо Партнёр. Для вас уже готов сайт с онлайн-записью: ${r.url} Посмотрите, пожалуйста, 30 секунд — если понравится, подключу.`;

const SECTIONS = [
  { key: 'overview', label: 'Обзор', icon: SquaresFour },
  { key: 'services', label: 'Сервисы', icon: Briefcase },
  { key: 'leads', label: 'Лиды', icon: UsersThree },
  { key: 'invoices', label: 'Счета', icon: Receipt },
  { key: 'earnings', label: 'Начисления', icon: CurrencyRub },
  { key: 'referrals', label: 'Мои партнёры', icon: UserPlus },
  { key: 'materials', label: 'Материалы', icon: Copy },
  { key: 'messages', label: 'Сообщения', icon: ChatCircle },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

function CopyButton({ text, label = 'Копировать' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* нет доступа к буферу */ } setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="btn-secondary press shrink-0 text-caption"
    >{done ? 'Скопировано ✓' : label}</button>
  );
}

export default function PartnerDemo() {
  const [section, setSection] = useState<SectionKey>('overview');
  const [navOpen, setNavOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<ReadySite | null>(null);
  const [sites, setSites] = useState<ReadySite[]>(READY_SITES);
  const [photoFor, setPhotoFor] = useState<ReadySite | null>(null);
  const [leads, setLeads] = useState<Lead[]>([
    { id: 'l1', name: 'Анна, салон красоты', phone: '+7 900 111-22-33', email: 'anna@example.ru', status: 'contacted' },
    { id: 'l2', name: 'Игорь, автосервис', phone: '+7 900 444-55-66', email: '', status: 'new' },
    { id: 'l3', name: 'Марина, студия йоги', phone: '', email: 'mary@example.ru', status: 'converted' },
  ]);
  const [checkouts, setCheckouts] = useState<Checkout[]>([
    { id: 'c1', variant: 'subscription_5000', amount: 5000, commission: 1000, commissionType: 'recurring_monthly', entrepreneur: 'Анна, салон красоты', site: 'Салон красоты «Локон»', status: 'paid' },
    { id: 'c2', variant: 'code_5000', amount: 5000, commission: 1000, commissionType: 'one_time', entrepreneur: 'Марина, студия йоги', site: 'Студия йоги «Дыши»', status: 'paid' },
    { id: 'c3', variant: 'custom', amount: 20000, commission: 5000, commissionType: 'one_time', entrepreneur: 'Игорь, автосервис', site: 'Автосервис «Гараж»', status: 'awaiting_payment' },
  ]);
  const [variant, setVariant] = useState<Variant>('subscription_5000');
  const [custom, setCustom] = useState('20000');
  const [leadDraft, setLeadDraft] = useState({ name: '', phone: '', email: '' });
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // Те же правила, что в реальном кабинете (lib/partners.ts → partnerSummary):
  // начислено — только по оплаченным счетам, к выплате — из начисленного ещё не выплаченное.
  const paid = checkouts.filter((c) => c.status === 'paid');
  const totalAccrued = paid.reduce((s, c) => s + c.commission, 0);
  const paidOut = 0; // в демо выплат ещё не было
  const pending = totalAccrued - paidOut;
  const recurring = paid.filter((c) => c.commissionType === 'recurring_monthly').reduce((s, c) => s + c.commission, 0);

  const deal = computeDeal(variant, variant === 'custom' ? Number(custom) : undefined);

  const go = (key: SectionKey) => { setSection(key); setNavOpen(false); };

  const addLead = () => {
    if (!leadDraft.name.trim()) { setErr('Укажите имя'); return; }
    setErr(null);
    setLeads((prev) => [{ id: `l${Date.now()}`, name: leadDraft.name.trim(), phone: leadDraft.phone.trim(), email: leadDraft.email.trim(), status: 'new' }, ...prev]);
    setLeadDraft({ name: '', phone: '', email: '' });
  };

  const createCheckout = () => {
    if (variant === 'custom' && (!Number(custom) || Number(custom) <= 0)) { setErr('Укажите сумму больше нуля'); return; }
    setErr(null);
    const item: Checkout = {
      id: `c${Date.now()}`,
      variant,
      amount: deal.amount,
      commission: deal.commission,
      commissionType: deal.commissionType,
      entrepreneur: selectedSite ? `Клиент: ${selectedSite.title}` : 'Без привязки к сайту',
      site: selectedSite?.title ?? '—',
      status: 'awaiting_payment',
    };
    setCheckouts((prev) => [item, ...prev]);
    setCreated(`Счёт на ${rub(deal.amount)} создан. В демо ссылка на оплату не формируется.`);
    setTimeout(() => setCreated(null), 5000);
  };

  const nav = (
    <nav className="mt-4 flex flex-1 flex-col gap-1" aria-label="Разделы кабинета">
      {SECTIONS.map((s) => {
        const Glyph = s.icon;
        const active = section === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => go(s.key)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-body-sm transition-colors ${active ? 'bg-white/[0.08] text-white' : 'text-brand-text-muted hover:bg-white/[0.04] hover:text-white'}`}
          >
            <Glyph size={19} weight={active ? 'bold' : 'regular'} aria-hidden="true" /> {s.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="detailing-root min-h-screen">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-scoped.css" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-fonts.css" />

      <div className="flex min-h-screen flex-row max-lg:flex-col">
        <aside className="hidden w-[264px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c0c] p-3 lg:flex" style={{ position: 'sticky', top: 0, height: '100vh' }}>
          <div className="flex items-center gap-2 rounded-full px-2 py-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-accent-solid text-[15px] font-semibold text-brand-accent-on">P</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">Кабинет партнёра</div>
              <div className="truncate text-caption text-brand-text-subtle">Демо Партнёр</div>
            </div>
          </div>
          {nav}
          <div className="mt-auto rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.08] p-3 text-caption text-brand-accent">
            Демо-режим: данные не сохраняются, действия локальные.
            <a className="mt-1 block underline" href="/partner">Перейти в боевой кабинет →</a>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-sticky flex items-center justify-between gap-3 border-b border-white/[0.06] bg-black/80 px-4 py-3 backdrop-blur-xl md:px-6">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setNavOpen(true)} aria-label="Открыть меню" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-brand-text-muted hover:text-white lg:hidden">
                <List size={20} weight="bold" aria-hidden="true" />
              </button>
              <h1 className="text-heading-md">{SECTIONS.find((s) => s.key === section)?.label}</h1>
            </div>
            <span className="rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3 py-1 text-caption text-brand-accent">ДЕМО</span>
          </header>

          {navOpen && (
            <div className="fixed inset-0 z-modal" style={{ zIndex: 300 }}>
              <button type="button" aria-label="Закрыть меню" onClick={() => setNavOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <aside className="absolute left-0 top-0 flex h-full w-[280px] max-w-[82%] flex-col border-r border-white/[0.06] bg-[#0c0c0c] p-3">
                <div className="flex items-center justify-between px-2 py-2">
                  <span className="text-[15px] font-semibold">Кабинет партнёра</span>
                  <button type="button" onClick={() => setNavOpen(false)} aria-label="Закрыть меню" className="grid size-8 place-items-center rounded-lg text-brand-text-muted hover:bg-white/[0.06] hover:text-white"><X size={18} weight="bold" aria-hidden="true" /></button>
                </div>
                {nav}
              </aside>
            </div>
          )}

          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-10 pt-4 md:px-6 md:pt-5">
            {err && <div className="mb-3 rounded-2xl border border-brand-error/40 bg-brand-error/10 px-4 py-2 text-body-sm text-brand-error">{err}</div>}
            {created && <div className="mb-3 rounded-2xl border border-brand-success/40 bg-brand-success/10 px-4 py-2 text-body-sm text-brand-success">{created}</div>}

            {section === 'overview' && (
              <div className="space-y-5">
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="Начислено всего" value={rub(totalAccrued)} />
                  <Stat label="К выплате" value={rub(pending)} accent />
                  <Stat label="Выплачено" value={rub(paidOut)} />
                  <Stat label="Рекуррентных/мес" value={rub(recurring)} />
                </section>
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">Что делать сейчас</h2>
                  <ul className="mt-3 space-y-2 text-body-sm text-brand-text-muted">
                    <li className="flex items-start gap-2"><CheckCircle size={16} weight="bold" className="mt-0.5 shrink-0 text-brand-success" aria-hidden="true" /> Возьмите сервис из «Сервисов» — не больше 5 одновременно.</li>
                    <li className="flex items-start gap-2"><CheckCircle size={16} weight="bold" className="mt-0.5 shrink-0 text-brand-success" aria-hidden="true" /> Напишите предпринимателю и отметьте «Написал».</li>
                    <li className="flex items-start gap-2"><CheckCircle size={16} weight="bold" className="mt-0.5 shrink-0 text-brand-success" aria-hidden="true" /> Выставьте счёт и отправьте ссылку клиенту.</li>
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary press text-body-sm" onClick={() => go('services')}>К сервисам</button>
                    <button type="button" className="btn-secondary press text-body-sm" onClick={() => go('invoices')}>Выставить счёт</button>
                  </div>
                </section>
              </div>
            )}

            {section === 'services' && (
              <section>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-heading-sm">Готовые сервисы</h2>
                    <p className="mt-1 text-caption text-brand-text-muted">Одобренные платформой сайты. Видны всем партнёрам, пока сервис не взяли в работу.</p>
                  </div>
                  <span className="text-caption text-brand-text-subtle">доступно: {sites.filter((r) => !r.assigned).length}</span>
                </div>
                <div className="mt-3 overflow-x-auto rounded-3xl border border-brand-border bg-brand-surface">
                  <table className="w-full min-w-[900px] text-left text-body-sm">
                    <thead className="text-caption uppercase tracking-wide text-brand-text-subtle">
                      <tr>
                        <th className="px-4 py-3">Сервис</th><th className="px-4 py-3">Город</th>
                        <th className="px-4 py-3">Контакты</th><th className="px-4 py-3">Оценка</th>
                        <th className="px-4 py-3">История</th><th className="px-4 py-3">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sites.map((r) => (
                        <tr key={r.id} className="border-t border-white/[0.06] align-top">
                          <td className="px-4 py-3"><div className="font-medium">{r.title}</div><div className="text-caption text-brand-text-subtle">{r.niche}</div></td>
                          <td className="px-4 py-3 text-brand-text-muted">{r.city}</td>
                          <td className="px-4 py-3"><a className="text-brand-accent hover:underline" href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a></td>
                          <td className="px-4 py-3 text-brand-text-muted">{r.rating.toFixed(1)} · {r.reviews} отз.</td>
                          <td className="px-4 py-3 text-caption text-brand-text-subtle">
                            {r.refusals > 0 && <div>отказался {r.refusals} раз</div>}
                            {r.noAnswer > 0 && <div>не ответил {r.noAnswer} раз</div>}
                            {r.refusals === 0 && r.noAnswer === 0 && <span>—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              <CopyButton text={MOCK_MESSAGE(r)} label="Текст" />
                              <button type="button" onClick={() => setPhotoFor(r)} className="btn-ghost px-2 py-1 text-caption">Фото</button>
                              <button
                                type="button"
                                disabled={r.assigned}
                                onClick={() => { setSites((prev) => prev.map((x) => (x.id === r.id ? { ...x, assigned: true } : x))); setSelectedSite(r); }}
                                className="btn-primary press text-caption disabled:opacity-50"
                              >{r.assigned ? 'В работе' : 'Взять'}</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {section === 'leads' && (
              <div className="space-y-5">
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">Новый лид</h2>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input value={leadDraft.name} onChange={(e) => setLeadDraft({ ...leadDraft, name: e.target.value })} placeholder="Имя" className="input" />
                    <input value={leadDraft.phone} onChange={(e) => setLeadDraft({ ...leadDraft, phone: e.target.value })} placeholder="Телефон" className="input" />
                    <input value={leadDraft.email} onChange={(e) => setLeadDraft({ ...leadDraft, email: e.target.value })} placeholder="Email" className="input" />
                  </div>
                  <button type="button" className="btn-primary press mt-2 text-body-sm" onClick={addLead}>Добавить лида</button>
                </section>

                <ul className="space-y-3">
                  {leads.map((l) => {
                    const st = STATUSES.find((s) => s.v === l.status) ?? STATUSES[0];
                    return (
                      <li key={l.id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-brand-border bg-brand-surface p-4">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-body-sm font-medium">{l.name}</div>
                          <div className="truncate text-caption text-brand-text-subtle">{[l.phone, l.email].filter(Boolean).join(' · ') || 'нет контактов'}</div>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-caption ${st.cls}`}>{st.t}</span>
                        <select
                          value={l.status}
                          onChange={(e) => setLeads((prev) => prev.map((x) => (x.id === l.id ? { ...x, status: e.target.value } : x)))}
                          className="input !min-h-9 !py-1.5 text-caption"
                          aria-label={`Статус лида ${l.name}`}
                        >
                          {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}
                        </select>
                        <button type="button" className="btn-ghost px-2 py-1 text-caption text-brand-error" onClick={() => setLeads((prev) => prev.filter((x) => x.id !== l.id))}>Удалить</button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {section === 'invoices' && (
              <div className="space-y-5">
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">Новый счёт</h2>
                  <p className="mt-1 text-caption text-brand-text-muted">Выберите вариант сделки — в демо ссылка на оплату не формируется.</p>
                  {selectedSite && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.06] p-3">
                      <span className="text-caption text-brand-accent">Готовый сайт:</span>
                      <span className="text-body-sm font-medium">{selectedSite.title}</span>
                      <CopyButton text={selectedSite.url} label="Ссылка" />
                    </div>
                  )}
                  <div className="mt-4 space-y-2">
                    {([
                      { v: 'subscription_5000' as Variant, t: 'Подписка 5 000 ₽/мес', d: 'Клиент платит 5 000 ₽/мес → вы 1 000 ₽/мес' },
                      { v: 'code_5000' as Variant, t: 'Сайт-визитка 5 000 ₽', d: 'Клиент платит 5 000 ₽ за сайт → вы 1 000 ₽ разово' },
                      { v: 'custom' as Variant, t: 'Своя сумма', d: 'Вы назначаете цену: платформа 75%, вы 25%' },
                    ]).map((o) => (
                      <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${variant === o.v ? 'border-brand-accent/50 bg-brand-accent/[0.06]' : 'border-white/[0.06] hover:bg-white/[0.02]'}`}>
                        <input type="radio" name="variant" checked={variant === o.v} onChange={() => setVariant(o.v)} className="mt-1" />
                        <span><span className="block text-body-sm font-medium">{o.t}</span><span className="block text-caption text-brand-text-subtle">{o.d}</span></span>
                      </label>
                    ))}
                  </div>
                  {variant === 'custom' && (
                    <input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="numeric" placeholder="Сумма, ₽" className="input mt-3 w-full" />
                  )}
                  <div className="mt-3 rounded-2xl border border-white/[0.06] px-3 py-2 text-caption text-brand-text-muted">
                    Итого клиент платит <b className="text-brand-text">{rub(deal.amount)}</b>, ваше вознаграждение <b className="text-brand-accent">{rub(deal.commission)}</b>
                    {deal.commissionType === 'recurring_monthly' ? ' каждый месяц' : ' разово'}.
                  </div>
                  <button type="button" className="btn-primary press mt-3 text-body-sm" onClick={createCheckout}>Создать счёт</button>
                </section>

                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">История счетов</h2>
                  <ul className="mt-3 divide-y divide-white/[0.06]">
                    {checkouts.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-sm">{c.entrepreneur}</span>
                          <span className="block truncate text-caption text-brand-text-subtle">{c.site} · {rub(c.amount)} · вознаграждение {rub(c.commission)}</span>
                        </span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-caption ${c.status === 'paid' ? 'border-brand-success/30 text-brand-success' : 'border-brand-accent/30 text-brand-accent'}`}>
                          {c.status === 'paid' ? 'оплачен' : 'ждёт оплаты'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            {section === 'earnings' && (
              <div className="grid gap-4">
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Stat label="Начислено всего" value={rub(totalAccrued)} accent />
                  <Stat label="Выплачено" value={rub(paidOut)} />
                  <Stat label="Ожидает выплаты" value={rub(pending)} />
                </section>
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">История начислений</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[460px] text-left text-body-sm">
                      <thead className="text-caption text-brand-text-subtle"><tr><th className="py-2 pr-3 font-medium">Клиент</th><th className="py-2 pr-3 font-medium">Тип</th><th className="py-2 pr-3 font-medium">Статус</th><th className="py-2 font-medium">Сумма</th></tr></thead>
                      <tbody>
                        {paid.map((c) => (
                          <tr key={c.id} className="border-t border-white/[0.06]">
                            <td className="py-2 pr-3">{c.entrepreneur}</td>
                            <td className="py-2 pr-3 text-brand-text-muted">{c.commissionType === 'recurring_monthly' ? 'Подписка' : 'Разовое'}</td>
                            <td className="py-2 pr-3 text-brand-accent">начислено</td>
                            <td className="py-2 font-medium">{rub(c.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {section === 'referrals' && (
              <div className="grid gap-4">
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">Пригласите партнёра</h2>
                  <p className="mt-1 text-body-sm text-brand-text-muted">
                    Вы получаете <strong className="text-brand-text">10% от заработка</strong> каждого приглашённого партнёра.
                    Платформа платит эту сумму отдельно — у него ничего не вычитается.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input readOnly value="https://zapishisya.ru/auth?mode=register&role=partner&ref=PR-DEMO01" aria-label="Ссылка-приглашение" className="min-w-0 flex-1 rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 font-mono text-caption text-brand-text" />
                    <CopyButton text="https://zapishisya.ru/auth?mode=register&role=partner&ref=PR-DEMO01" label="Скопировать" />
                  </div>
                </section>
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">Мои партнёры</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-body-sm">
                      <thead className="text-caption text-brand-text-subtle"><tr><th className="py-2 pr-3 font-medium">Партнёр</th><th className="py-2 pr-3 font-medium">Пришёл</th><th className="py-2 pr-3 font-medium">Его заработок</th><th className="py-2 font-medium">Ваш бонус</th></tr></thead>
                      <tbody>
                        <tr className="border-t border-white/[0.06]">
                          <td className="py-2 pr-3"><div className="font-medium">Ирина Смирнова</div><div className="text-caption text-brand-text-subtle">irina@example.ru</div></td>
                          <td className="py-2 pr-3 text-brand-text-muted">12.10.2026</td>
                          <td className="py-2 pr-3">{rub(3000)}</td>
                          <td className="py-2 text-brand-accent">{rub(300)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {section === 'materials' && (
              <div className="grid gap-4">
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">Как работать с готовыми сервисами</h2>
                  <ol className="mt-3 space-y-2 text-body-sm text-brand-text-muted" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    <li><strong className="text-brand-text">1.</strong> Откройте «Сервисы» — там телефон, город, оценка и отзывы.</li>
                    <li><strong className="text-brand-text">2.</strong> Нажмите «Фото» и подберите изображения. Первое станет обложкой.</li>
                    <li><strong className="text-brand-text">3.</strong> Нажмите «Текст» — сообщение скопируется в буфер.</li>
                    <li><strong className="text-brand-text">4.</strong> Возьмите сервис в работу и отметьте «Написал».</li>
                  </ol>
                </section>
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">Что предлагать</h2>
                  <ul className="mt-3 space-y-2 text-body-sm text-brand-text-muted" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    <li>Готовый сайт-визитка с онлайн-записью — с услугами, контактами и фото.</li>
                    <li>Предприниматель видит сайт до оплаты и решает по готовому результату.</li>
                    <li>Второй уровень: приглашайте партнёров и получайте 10% из средств платформы.</li>
                  </ul>
                </section>
              </div>
            )}

            {section === 'messages' && (
              <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                <h2 className="text-heading-sm">Сообщения от платформы</h2>
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.06] px-3 py-2 text-body-sm text-brand-text-muted">
                  <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0 text-brand-accent" aria-hidden="true" />
                  В демо-режиме сообщений нет — в боевом кабинете здесь ответы администратора платформы.
                </div>
              </section>
            )}
            {photoFor && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Фото сервиса ${photoFor.title}`}>
                <div className="max-h-[85vh] w-full max-w-[720px] overflow-y-auto rounded-3xl border border-white/[0.10] bg-brand-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="text-heading-sm">Фото: {photoFor.title}</h2>
                      <p className="mt-1 text-caption text-brand-text-muted">В демо выбор локальный и никуда не сохраняется. В боевом кабинете фото меняются на сайте.</p></div>
                    <button type="button" onClick={() => setPhotoFor(null)} className="btn-ghost px-2 py-1 text-caption">Закрыть</button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {photoFor.photos.map((url, i) => (
                      <div key={`${url}-${i}`} className="overflow-hidden rounded-2xl border border-white/[0.08]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-28 w-full object-cover" />
                        <span className="block px-2 py-1 text-caption text-brand-text-muted">{i === 0 ? 'Фото сервиса (главное)' : `Фото сервиса ${i + 1}`}</span>
                      </div>
                    ))}
                    <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/media/covers/detailing.svg" alt="" className="h-28 w-full object-cover" />
                      <span className="block px-2 py-1 text-caption text-brand-text-muted">Шаблонная обложка</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-surface p-4">
      <div className="text-caption text-brand-text-subtle">{label}</div>
      <div className={`mt-1 text-[20px] font-semibold ${accent ? 'text-brand-accent' : 'text-brand-text'}`}>{value}</div>
    </div>
  );
}
