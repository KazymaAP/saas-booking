// app/demo/page.tsx — лаунчер демо-кабинетов в оболочке настоящей панели:
// тёмный сайдбар, липкая шапка, карточки разделов. Никакой маркетинговой вёрстки.
import Link from 'next/link';

export const metadata = { title: 'Демо-кабинеты — Запишись', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const CARDS = [
  {
    href: '/partner/demo',
    letter: 'P',
    title: 'Кабинет партнёра',
    subtitle: 'DEMO Партнёр',
    features: [
      'Лиды: добавление, статусы, удаление',
      'Счета: подписка, визитка, своя сумма',
      'Начисления и выплаты, реферальная программа',
      'Готовые сервисы и тексты первых сообщений',
    ],
  },
  {
    href: '/demo/business',
    letter: 'B',
    title: 'Кабинет предпринимателя',
    subtitle: 'DEMO — Студия маникюра «Любава»',
    features: [
      'Записи: новые, подтверждённые, выполненные',
      'Услуги: цены, длительность, порядок',
      'Фото, тексты и настройки сайта',
      'Оформление панели и подписка',
    ],
  },
] as const;

export default function DemoIndexPage() {
  return (
    <div className="detailing-root min-h-screen">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-scoped.css" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-fonts.css" />

      <div className="flex min-h-screen flex-row max-lg:flex-col">
        <aside
          className="hidden w-[264px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c0c] p-3 lg:flex"
          style={{ position: 'sticky', top: 0, height: '100vh' }}
        >
          <div className="flex items-center gap-2 rounded-full px-2 py-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-accent-solid text-[15px] font-semibold text-brand-accent-on">D</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">Демо-кабинеты</div>
              <div className="truncate text-caption text-brand-text-subtle">Песочница платформы</div>
            </div>
          </div>

          <nav className="mt-4 flex flex-1 flex-col gap-1" aria-label="Демо-кабинеты">
            <Link href="/partner/demo" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-body-sm text-brand-text-muted transition-colors hover:bg-white/[0.04] hover:text-white">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-caption">P</span>
              <span className="flex-1 text-left">Партнёр</span>
            </Link>
            <Link href="/demo/business" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-body-sm text-brand-text-muted transition-colors hover:bg-white/[0.04] hover:text-white">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-caption">B</span>
              <span className="flex-1 text-left">Предприниматель</span>
            </Link>
          </nav>

          <div className="mt-auto rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.08] p-3 text-caption text-brand-accent">
            ДЕМО. Данные изолированы — реальные кабинеты и сайты не затрагиваются.
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-sticky flex items-center justify-between gap-3 border-b border-white/[0.06] bg-black/80 px-4 py-3 backdrop-blur-xl md:px-6">
            <h1 className="text-heading-md">Демо-кабинеты</h1>
            <span className="rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3 py-1 text-caption text-brand-accent">ДЕМО</span>
          </header>

          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-10 pt-4 md:px-6 md:pt-5">
            <p className="mb-4 text-body-sm text-brand-text-muted">
              Выберите кабинет — откроется полноценная панель с реальными данными и рабочими действиями.
              «Демо» — только название аккаунта, интерфейс и функциональность боевые.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              {CARDS.map((c) => (
                <section key={c.href} className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-accent-solid text-[15px] font-semibold text-brand-accent-on">
                      {c.letter}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-heading-sm">{c.title}</h2>
                      <div className="truncate text-caption text-brand-text-subtle">{c.subtitle}</div>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2 text-body-sm text-brand-text-muted">
                    {c.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-accent" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href={c.href} className="btn-primary press mt-5 inline-flex text-body-sm">Открыть кабинет</a>
                </section>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
