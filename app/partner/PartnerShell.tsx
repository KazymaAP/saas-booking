'use client';

// app/partner/PartnerShell.tsx — оболочка кабинета партнёра в стиле супер-админки:
// тёмная тема, боковой навигатор, переключение разделов без перезагрузки.
// Данные приходят из серверной страницы: никаких демо-значений здесь нет.
import { useEffect, useState } from 'react';
import {
  SquaresFour, Briefcase, UsersThree, Receipt, ChatCircle, SignOut, List, X,
  CheckCircle, WarningCircle, CurrencyRub, TrendUp, UserPlus, Copy,
} from '@phosphor-icons/react';
import type { Partner, PartnerCheckout, PartnerLead, PartnerReadySite, PartnerSummary } from '@/lib/partners';
import type { ReadyService } from '@/lib/ready-services';
import { partnerLogoutAction } from './actions';
import { LeadsManager, PartnerWorkspace } from './components';
import { PartnerReadyPanel } from './ready-panel';

type Message = { id: string; body: string; from_admin: boolean; created_at: string };
type Section = 'overview' | 'services' | 'leads' | 'invoices' | 'earnings' | 'referrals' | 'materials' | 'messages';

type Earning = { id: string; amount: number; type: string; status: string; created_at: string; period_start: string | null; period_end: string | null };

type ReferralRow = { id: string; name: string | null; email: string; created_at: string; status: string; earned: number; bonus: number };
type ReferralTotals = { partners: number; bonusAccrued: number; bonusPaid: number; bonusPending: number };

const NAV: { key: Section; label: string; icon: typeof SquaresFour }[] = [
  { key: 'overview', label: 'Обзор', icon: SquaresFour },
  { key: 'services', label: 'Сервисы', icon: Briefcase },
  { key: 'leads', label: 'Лиды', icon: UsersThree },
  { key: 'invoices', label: 'Счета', icon: Receipt },
  { key: 'earnings', label: 'Начисления', icon: CurrencyRub },
  { key: 'referrals', label: 'Мои партнёры', icon: UserPlus },
  { key: 'materials', label: 'Материалы', icon: Copy },
  { key: 'messages', label: 'Сообщения', icon: ChatCircle },
];

const TITLES: Record<Section, string> = {
  overview: 'Обзор',
  services: 'Готовые сервисы',
  leads: 'Мои лиды',
  invoices: 'Счета и оплата',
  earnings: 'Начисления и выплаты',
  referrals: 'Мои партнёры',
  materials: 'Материалы и скрипты',
  messages: 'Сообщения от платформы',
};

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

export function PartnerShell({
  partner, summary, leads, checkouts, readySites, ready, messages, referrals, outreach, earnings, yookassaReady, demo = false,
}: {
  partner: Partner;
  summary: PartnerSummary;
  leads: PartnerLead[];
  checkouts: PartnerCheckout[];
  readySites: PartnerReadySite[];
  ready: { available: ReadyService[]; mine: ReadyService[]; overdue: ReadyService[]; inProcessCount: number };
  messages: Message[];
  referrals: { rows: ReferralRow[]; totals: ReferralTotals };
  outreach: Record<string, string>;
  earnings: Earning[];
  yookassaReady: boolean;
  /** Демо-аккаунт: показываем бейдж «ДЕМО» и предупреждение о песочнице. */
  demo?: boolean;
}) {
  const [section, setSection] = useState<Section>('overview');
  const [navOpen, setNavOpen] = useState(false);

  const go = (key: Section) => { setSection(key); setNavOpen(false); };
  const unread = messages.length;

  const nav = (
    <nav className="mt-4 flex flex-1 flex-col gap-1" aria-label="Разделы кабинета">
      {NAV.map((item) => {
        const Glyph = item.icon;
        const active = section === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => go(item.key)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-body-sm transition-colors ${active ? 'bg-white/[0.08] text-white' : 'text-brand-text-muted hover:bg-white/[0.04] hover:text-white'}`}
          >
            <Glyph size={19} weight={active ? 'bold' : 'regular'} aria-hidden="true" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.key === 'messages' && unread > 0 && (
              <span className="rounded-full bg-brand-accent/20 px-2 py-0.5 text-caption text-brand-accent">{unread}</span>
            )}
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
        {/* WCAG 2.4.1: клавиатурный пользователь может миновать меню и сразу попасть к содержимому. */}
        <a href="#partner-main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-brand-surface focus:px-3 focus:py-2 focus:text-brand-text">
          К содержимому
        </a>
        <aside className="hidden w-[264px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c0c] p-3 lg:flex" style={{ position: 'sticky', top: 0, height: '100vh' }}>
          <div className="flex items-center gap-2 rounded-full px-2 py-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-accent-solid text-[15px] font-semibold text-brand-accent-on">P</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">Кабинет партнёра{demo ? ' — DEMO' : ''}</div>
              <div className="truncate text-caption text-brand-text-subtle">{partner.name ?? partner.email}</div>
            </div>
          </div>

          {nav}

          <div className="mt-auto space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="text-caption text-brand-text-subtle">Ваш код</div>
            <div className="font-mono text-body-sm text-brand-accent">{partner.referral_code}</div>
            <form action={partnerLogoutAction}>
              <button className="btn-ghost press mt-1 flex w-full items-center justify-center gap-2 text-caption">
                <SignOut size={14} weight="bold" aria-hidden="true" /> Выйти
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-sticky flex items-center justify-between gap-3 border-b border-white/[0.06] bg-black/80 px-4 py-3 backdrop-blur-xl md:px-6">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setNavOpen(true)} aria-label="Открыть меню" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-brand-text-muted transition-colors hover:text-white lg:hidden">
                <List size={20} weight="bold" aria-hidden="true" />
              </button>
              <h1 className="text-heading-md">{TITLES[section]}</h1>
            </div>
            <div className="flex items-center gap-2 text-caption text-brand-text-subtle">
              <span className="hidden sm:inline">К выплате:</span>
              <span className="rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3 py-1 text-body-sm text-brand-accent">{rub(summary.pending)}</span>
            </div>
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

          <main id="partner-main" tabIndex={-1} className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-10 pt-4 outline-none md:px-6 md:pt-5">
            {!yookassaReady && (
              <div className="mb-4 rounded-2xl border border-brand-accent/30 bg-brand-accent/10 px-4 py-2 text-caption text-brand-accent">
                ЮKassa не настроена (нет YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY). Счета создаются в тестовом режиме: деньги не списываются.
                Для боевых платежей задайте ключи в переменных окружения.
              </div>
            )}

            {section === 'overview' && (
              <div className="space-y-5">
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatCard label="Начислено всего" value={rub(summary.totalAccrued)} icon={CurrencyRub} />
                  <StatCard label="К выплате" value={rub(summary.pending)} icon={TrendUp} accent />
                  <StatCard label="Рекуррентных/мес" value={rub(summary.recurringMonthly)} icon={CheckCircle} />
                  <StatCard label="Разовых" value={rub(summary.oneTime)} icon={Receipt} />
                </section>

                <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                    <h2 className="text-heading-sm">Что делать сейчас</h2>
                    <ul className="mt-3 space-y-2 text-body-sm text-brand-text-muted">
                      <li className="flex items-start gap-2"><CheckCircle size={16} weight="bold" className="mt-0.5 shrink-0 text-brand-success" aria-hidden="true" /> Возьмите сервис из «Готовых сервисов» — не больше 5 одновременно.</li>
                      <li className="flex items-start gap-2"><CheckCircle size={16} weight="bold" className="mt-0.5 shrink-0 text-brand-success" aria-hidden="true" /> Напишите предпринимателю и отметьте «Написал» — иначе через 3 дня сервис вернётся в общую таблицу.</li>
                      <li className="flex items-start gap-2"><CheckCircle size={16} weight="bold" className="mt-0.5 shrink-0 text-brand-success" aria-hidden="true" /> Выставьте счёт в разделе «Счета» — ссылку на оплату отправьте клиенту.</li>
                    </ul>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className="btn-primary press text-body-sm" onClick={() => go('services')}>К сервисам</button>
                      <button type="button" className="btn-secondary press text-body-sm" onClick={() => go('invoices')}>Выставить счёт</button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-heading-sm">В работе</h2>
                      <span className={`text-caption ${ready.inProcessCount >= 5 ? 'text-brand-error' : 'text-brand-text-subtle'}`}>{ready.inProcessCount} / 5</span>
                    </div>
                    {ready.mine.length === 0 ? (
                      <p className="mt-3 text-body-sm text-brand-text-muted">Пока ничего не взято в работу.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {ready.mine.slice(0, 4).map((r) => (
                          <li key={r.id} className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.06] px-3 py-2">
                            <span className="min-w-0 truncate text-body-sm">{r.name}</span>
                            <span className="shrink-0 text-caption text-brand-text-subtle">{r.assignment_status === 'written' ? 'написал' : 'в процессе'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {ready.overdue.length > 0 && (
                      <p className="mt-3 flex items-center gap-2 text-caption text-brand-accent">
                        <WarningCircle size={14} weight="bold" aria-hidden="true" /> {ready.overdue.length} сервис(ов) просрочены — выберите итог
                      </p>
                    )}
                  </div>
                </section>

                {messages.length > 0 && (
                  <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-heading-sm">Последние сообщения</h2>
                      <button type="button" className="text-caption text-brand-accent hover:text-white" onClick={() => go('messages')}>Все сообщения →</button>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {messages.slice(0, 3).map((m) => (
                        <li key={m.id} className="rounded-2xl border border-white/[0.06] px-3 py-2 text-caption text-brand-text-muted">
                          <span className="text-brand-text-subtle">{new Date(m.created_at).toLocaleString('ru-RU')}: </span>{m.body}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {section === 'services' && (
              <PartnerReadyPanel
                available={ready.available}
                mine={ready.mine}
                overdue={ready.overdue}
                inProcessCount={ready.inProcessCount}
                messages={[]}
                outreach={outreach}
              />
            )}

            {section === 'leads' && <LeadsManager initialLeads={leads} />}

            {section === 'invoices' && (
              <div className="space-y-5">
                <PartnerWorkspace sites={readySites} />
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">История счетов</h2>
                  <p className="mt-1 text-caption text-brand-text-muted">Счета, которые вы сформировали предпринимателям.</p>
                  {checkouts.length === 0 ? (
                    <p className="mt-3 text-body-sm text-brand-text-muted">Пока нет счетов.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-white/[0.06]">
                      {checkouts.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-sm">{c.entrepreneur_name ?? 'Предприниматель'}</span>
                            <span className="block truncate text-caption text-brand-text-subtle">
                              {c.variant} · {rub(c.amount)} · вознаграждение {rub(c.partner_commission)}
                            </span>
                          </span>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-caption ${c.status === 'paid' ? 'border-brand-success/30 text-brand-success' : c.status === 'awaiting_payment' ? 'border-brand-accent/30 text-brand-accent' : 'border-white/15 text-brand-text-subtle'}`}>
                            {c.status === 'paid' ? 'оплачен' : c.status === 'awaiting_payment' ? 'ждёт оплаты' : c.status}
                          </span>
                          <span className="shrink-0 text-caption text-brand-text-subtle">{new Date(c.created_at).toLocaleDateString('ru-RU')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {section === 'earnings' && (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="Начислено всего" value={rub(summary.totalAccrued)} icon={CurrencyRub} accent />
                  <StatCard label="Выплачено" value={rub(summary.totalPaidOut)} icon={CheckCircle} />
                  <StatCard label="Ожидает выплаты" value={rub(summary.pending)} icon={TrendUp} />
                </div>
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">История начислений</h2>
                  <p className="mt-1 text-caption text-brand-text-muted">Все суммы — из реальных оплат предпринимателей.</p>
                  {earnings.length === 0 ? (
                    <p className="mt-3 text-body-sm text-brand-text-muted">Начислений пока нет. Они появятся после первой оплаты по вашему счёту.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[460px] text-left text-body-sm">
                        <thead className="text-caption text-brand-text-subtle">
                          <tr><th className="py-2 pr-3 font-medium">Дата</th><th className="py-2 pr-3 font-medium">Тип</th><th className="py-2 pr-3 font-medium">Статус</th><th className="py-2 font-medium">Сумма</th></tr>
                        </thead>
                        <tbody>
                          {earnings.map((e) => (
                            <tr key={e.id} className="border-t border-white/[0.06]">
                              <td className="py-2 pr-3 text-brand-text-muted">{new Date(e.created_at).toLocaleDateString('ru-RU')}</td>
                              <td className="py-2 pr-3 text-brand-text-muted">{e.type === 'recurring_monthly' ? 'Подписка' : 'Разовое'}</td>
                              <td className="py-2 pr-3">
                                <span className={e.status === 'paid_out' ? 'text-brand-success' : 'text-brand-accent'}>
                                  {e.status === 'paid_out' ? 'выплачено' : 'начислено'}
                                </span>
                              </td>
                              <td className="py-2 font-medium">{rub(e.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {section === 'materials' && (
              <div className="grid gap-4">
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">Как работать с готовыми сервисами</h2>
                  <ol className="mt-3 space-y-2 text-body-sm text-brand-text-muted">
                    <li><strong className="text-brand-text">1.</strong> Откройте «Сервисы» и выберите бизнес из таблицы — там есть телефон, город, оценка и отзывы.</li>
                    <li><strong className="text-brand-text">2.</strong> Нажмите «Фото» и подберите изображения, которые лучше покажут сервис. Первое станет обложкой.</li>
                    <li><strong className="text-brand-text">3.</strong> Нажмите «Текст» — готовое сообщение скопируется в буфер. Отправьте его в мессенджере или по почте.</li>
                    <li><strong className="text-brand-text">4.</strong> Возьмите сервис в работу и отметьте «Написал». Через 3 дня выберите итог: отказался или не ответил.</li>
                  </ol>
                </section>
                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <h2 className="text-heading-sm">Что предлагать</h2>
                  <ul className="mt-3 space-y-2 text-body-sm text-brand-text-muted">
                    <li>Готовый сайт-визитка с онлайн-записью — уже с услугами, контактами и фотографиями.</li>
                    <li>Предприниматель видит сайт по ссылке до оплаты: решение принимает по готовому результату.</li>
                    <li>Дальше — подписка на платформу; ваше вознаграждение начисляется после оплаты.</li>
                    <li>Второй уровень: пригласите партнёров и получайте 10% от их заработка — отдельно, из средств платформы.</li>
                  </ul>
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
                  <InviteLink code={partner.referral_code} />
                </section>

                <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-heading-sm">Мои партнёры</h2>
                    <div className="flex flex-wrap gap-2 text-caption">
                      <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-brand-text-muted">
                        приглашено: <strong className="text-brand-text">{referrals.totals.partners}</strong>
                      </span>
                      <span className="rounded-full border border-brand-accent/30 bg-brand-accent/10 px-2.5 py-1 text-brand-accent">
                        начислено: {rub(referrals.totals.bonusAccrued)}
                      </span>
                      <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-brand-text-muted">
                        выплачено: {rub(referrals.totals.bonusPaid)}
                      </span>
                    </div>
                  </div>

                  {referrals.rows.length === 0 ? (
                    <p className="mt-3 text-body-sm text-brand-text-muted">
                      Пока никого нет. Отправьте ссылку выше — партнёр зарегистрируется и появится здесь.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-body-sm">
                        <thead className="text-caption text-brand-text-subtle">
                          <tr>
                            <th className="py-2 pr-3 font-medium">Партнёр</th>
                            <th className="py-2 pr-3 font-medium">Пришёл</th>
                            <th className="py-2 pr-3 font-medium">Его заработок</th>
                            <th className="py-2 font-medium">Ваш бонус</th>
                          </tr>
                        </thead>
                        <tbody>
                          {referrals.rows.map((r) => (
                            <tr key={r.id} className="border-t border-white/[0.06]">
                              <td className="py-2 pr-3">
                                <div className="font-medium">{r.name ?? 'Без имени'}</div>
                                <div className="text-caption text-brand-text-subtle">{r.email}</div>
                              </td>
                              <td className="py-2 pr-3 text-brand-text-muted">{new Date(r.created_at).toLocaleDateString('ru-RU')}</td>
                              <td className="py-2 pr-3">{rub(r.earned)}</td>
                              <td className="py-2 text-brand-accent">{rub(r.bonus)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {section === 'messages' && (
              <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                <h2 className="text-heading-sm">Сообщения от платформы</h2>
                <p className="mt-1 text-caption text-brand-text-muted">Уведомления и ответы администратора.</p>
                {messages.length === 0 ? (
                  <p className="mt-3 text-body-sm text-brand-text-muted">Сообщений нет.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {messages.map((m) => (
                      <li key={m.id} className={`rounded-2xl border px-3 py-2 text-body-sm ${m.from_admin ? 'border-brand-accent/30 bg-brand-accent/[0.06] text-brand-text' : 'border-white/[0.06] text-brand-text-muted'}`}>
                        <div className="text-caption text-brand-text-subtle">
                          {m.from_admin ? 'Администратор' : 'Вы'} · {new Date(m.created_at).toLocaleString('ru-RU')}
                        </div>
                        <div className="mt-0.5">{m.body}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// Ссылка-приглашение: собираем от текущего origin, чтобы работала и на основном домене, и локально.
function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [href, setHref] = useState(`/auth?mode=register&role=partner&ref=${code}`);
  useEffect(() => {
    setHref(`${window.location.origin}/auth?mode=register&role=partner&ref=${code}`);
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input readOnly value={href} aria-label="Ссылка-приглашение" className="min-w-0 flex-1 rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 font-mono text-caption text-brand-text" />
      <button type="button" onClick={copy} className="btn-ghost press flex items-center gap-2 text-caption">
        {copied ? <CheckCircle size={15} weight="bold" aria-hidden="true" /> : <Copy size={15} weight="bold" aria-hidden="true" />}
        {copied ? 'Скопировано' : 'Скопировать'}
      </button>
    </div>
  );
}

function StatCard({ label, value, icon: Glyph, accent }: { label: string; value: string; icon: typeof SquaresFour; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-surface p-4">
      <div className="flex items-center gap-2 text-caption text-brand-text-subtle">
        <Glyph size={14} weight="bold" aria-hidden="true" /> {label}
      </div>
      <div className={`mt-1 text-[20px] font-semibold ${accent ? 'text-brand-accent' : 'text-brand-text'}`}>{value}</div>
    </div>
  );
}
