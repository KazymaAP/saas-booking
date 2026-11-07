// app/page.tsx — главная (лендинг) платформы в стиле «Детейленг».
// Информация для клиентов (предпринимателей) и партнёров + витрина шаблонов ниш.
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CookieSettingsButton } from '@/components/CookieSettingsButton';
import { LEGAL_DOCS, getRequisites, operatorName, type Requisites } from '@/lib/legal';
import { ALL_NICHE_THEMES } from '@/шаблоны/_shared/themes';

export const metadata = {
  title: 'Запишись — готовый сайт с онлайн-записью для вашего бизнеса',
  description: 'Готовый сайт-визитка с онлайн-записью за 1 день. Для предпринимателей — быстрый запуск, для партнёров — вознаграждение за клиентов.',
};

export const revalidate = 86_400;

const palette = {
  '--color-bg': '7 11 20',
  '--color-surface': '13 20 36',
  '--color-border': '27 39 64',
  '--color-border-hover': '40 56 88',
  '--color-text': '242 246 255',
  '--color-text-muted': '159 176 204',
  '--color-text-subtle': '125 143 174',
  '--color-accent': '59 130 246',
  '--color-accent-2': '34 211 238',
  '--color-accent-solid': '37 99 235',
  '--color-accent-solid-hover': '29 78 216',
  '--color-success': '34 197 94',
} as CSSProperties;

const CLIENT_FEATURES = [
  { title: 'Запуск за 1 день', text: 'Присылаете услуги и контакты — мы собираем сайт из готового шаблона вашей ниши.' },
  { title: 'Онлайн-запись 24/7', text: 'Клиенты выбирают услугу и время сами, без звонков и переписки.' },
  { title: 'Работает с телефона', text: 'Устанавливается на экран, как приложение, без App Store и Play Market.' },
  { title: 'Без скрытых платежей', text: 'Понятная подписка или разовый выкуп кода — выбираете сами.' },
];

const STEPS = [
  'Выбираете нишу и шаблон',
  'Присылаете услуги, цены и контакты',
  'Мы собираем и показываем сайт',
  'Вы одобряете — клиенты записываются',
];

const PARTNER_MODELS = [
  { title: 'Подписка', text: 'Клиент платит 5 000 ₽/мес — вы получаете 1 000 ₽ каждый месяц.', tag: 'рекуррент' },
  { title: 'Продажа кода', text: 'Клиент покупает сайт за 5 000 ₽ — вы получаете 1 000 ₽ разово.', tag: 'разово' },
  { title: 'Своя цена', text: 'Назначаете любую сумму — вы получаете 25%, платформа 75%.', tag: '25%' },
];

export default async function Home() {
  const requisites = await getRequisites();
  return (
    <div className="detailing-root min-h-screen bg-brand-bg text-brand-text" style={palette}>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-scoped.css" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-fonts.css" />

      <header className="sticky top-0 z-50 border-b border-brand-border bg-[rgb(var(--color-bg)/0.82)] backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[69rem] items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-brand-accent-solid text-[15px] font-semibold text-white">З</span>
            <span className="text-[16px] font-semibold tracking-[-0.01em]">Запишись</span>
          </Link>
          <nav className="hidden items-center gap-6 text-body-sm text-brand-text-muted md:flex">
            <a href="#clients" className="transition-colors hover:text-brand-text">Клиентам</a>
            <a href="#partners" className="transition-colors hover:text-brand-text">Партнёрам</a>
            <a href="#templates" className="transition-colors hover:text-brand-text">Шаблоны</a>
            <a href="#pricing" className="transition-colors hover:text-brand-text">Тарифы</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/auth" className="btn-secondary hidden text-body-sm sm:inline-flex">Кабинет партнёра</Link>
            <Link href="/auth" className="btn-primary text-body-sm">Войти</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[69rem] px-4 pb-12 pt-12 md:px-6 md:pt-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-3 py-1 text-caption text-brand-text-muted">
                <span className="size-1.5 rounded-full bg-brand-success" aria-hidden="true" /> Онлайн-запись для бизнеса
              </span>
              <h1 className="mt-5 max-w-[640px] !text-[38px] !font-semibold leading-[1.05] tracking-[-0.035em] text-balance md:!text-[54px]">
                Готовый сайт с онлайн-записью за 1 день
              </h1>
              <p className="mt-4 max-w-[560px] text-[16px] leading-7 text-brand-text-muted">
                Делаем сайты-визитки для детейлинга, салонов, клиник, фитнеса и других ниш. Клиенты записываются с телефона за пару касаний.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#pricing" className="btn-primary">Хочу сайт</a>
                <Link href="/auth?mode=register&role=partner" className="btn-secondary">Стать партнёром</Link>
              </div>
              <div className="mt-9 grid max-w-[520px] grid-cols-3 gap-3">
                <div className="rounded-2xl border border-brand-border bg-brand-surface px-4 py-3">
                  <div className="text-[24px] font-semibold leading-none">10</div>
                  <div className="mt-1.5 text-caption text-brand-text-muted">готовых ниш</div>
                </div>
                <div className="rounded-2xl border border-brand-border bg-brand-surface px-4 py-3">
                  <div className="text-[24px] font-semibold leading-none">1 день</div>
                  <div className="mt-1.5 text-caption text-brand-text-muted">до запуска</div>
                </div>
                <div className="rounded-2xl border border-brand-border bg-brand-surface px-4 py-3">
                  <div className="text-[24px] font-semibold leading-none">24/7</div>
                  <div className="mt-1.5 text-caption text-brand-text-muted">онлайн-запись</div>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-brand-border bg-brand-surface p-5">
              <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[rgb(var(--color-accent)/0.25)] blur-3xl" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="text-caption text-brand-text-muted">Превью сайта</span>
                  <span className="rounded-full border border-brand-border px-2 py-0.5 text-caption text-brand-text-subtle">онлайн-запись</span>
                </div>
                <div className="mt-4 rounded-2xl border border-brand-border bg-brand-bg p-4">
                  <div className="text-[18px] font-semibold">GlowDetailing</div>
                  <div className="mt-1 text-caption text-brand-text-muted">Премиум-детейлинг вашего авто</div>
                  <div className="mt-4 space-y-2">
                    {['Комплексная мойка — 1 500 ₽', 'Химчистка салона — 6 500 ₽', 'Керамика — от 28 000 ₽'].map((s) => (
                      <div key={s} className="flex items-center justify-between rounded-xl border border-brand-border bg-brand-surface px-3 py-2 text-body-sm">
                        <span className="text-brand-text-muted">{s.split(' — ')[0]}</span>
                        <span>{s.split(' — ')[1]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="btn-primary mt-4 w-full text-body-sm">Записаться</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-[69rem] px-4 py-10 md:px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CLIENT_FEATURES.map((f) => (
              <div key={f.title} className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                <h3 className="text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-2 text-[13px] leading-5 text-brand-text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-[69rem] px-4 py-10 md:px-6">
          <h2 className="!text-[28px] !font-semibold tracking-[-0.03em]">Как это работает</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s} className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                <span className="grid size-9 place-items-center rounded-xl bg-brand-accent-solid text-[13px] font-semibold text-white">{i + 1}</span>
                <p className="mt-4 text-[14px] leading-5">{s}</p>
              </div>
            ))}
          </div>
        </section>

        {/* For clients */}
        <section id="clients" className="mx-auto max-w-[69rem] scroll-mt-24 px-4 py-10 md:px-6">
          <div className="rounded-3xl border border-brand-border bg-brand-surface p-6 md:p-8">
            <h2 className="!text-[28px] !font-semibold tracking-[-0.03em]">Клиентам — предпринимателям</h2>
            <p className="mt-2 max-w-[640px] text-[15px] leading-6 text-brand-text-muted">
              У вас уже есть бизнес и клиенты — добавьте удобную онлайн-запись и красивый сайт-визитку. Мы берём на себя дизайн, хостинг и обновления.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { t: 'Свой сайт на вашем домене', d: 'Или на нашем — с подключением собственного домена.' },
                { t: 'Услуги и цены — под вас', d: 'Меняете прайс и расписание в панели, сайт обновляется сам.' },
                { t: 'Заявки и запись', d: 'Все записи в одном месте, напоминания клиентам.' },
              ].map((x) => (
                <div key={x.t} className="rounded-2xl border border-brand-border bg-brand-bg p-4">
                  <div className="text-[14px] font-semibold">{x.t}</div>
                  <div className="mt-1.5 text-[13px] leading-5 text-brand-text-muted">{x.d}</div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <a href="#pricing" className="btn-primary text-body-sm">Посмотреть тарифы</a>
            </div>
          </div>
        </section>

        {/* For partners */}
        <section id="partners" className="mx-auto max-w-[69rem] scroll-mt-24 px-4 py-10 md:px-6">
          <div className="rounded-3xl border border-brand-border bg-brand-surface p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="!text-[28px] !font-semibold tracking-[-0.03em]">Партнёрам — заработок на клиентах</h2>
                <p className="mt-2 max-w-[640px] text-[15px] leading-6 text-brand-text-muted">
                  Берите готовые сайты из каталога, отправляйте предпринимателям и получайте вознаграждение. Личный кабинет, база лидов и выплаты — внутри.
                </p>
              </div>
              <Link href="/auth" className="btn-primary text-body-sm">Открыть кабинет партнёра</Link>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {PARTNER_MODELS.map((m) => (
                <div key={m.title} className="rounded-2xl border border-brand-border bg-brand-bg p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[14px] font-semibold">{m.title}</div>
                    <span className="rounded-full border border-brand-border px-2 py-0.5 text-caption text-brand-text-subtle">{m.tag}</span>
                  </div>
                  <div className="mt-1.5 text-[13px] leading-5 text-brand-text-muted">{m.text}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Templates */}
        <section id="templates" className="mx-auto max-w-[69rem] scroll-mt-24 px-4 py-10 md:px-6">
          <h2 className="!text-[28px] !font-semibold tracking-[-0.03em]">Шаблоны под 10 ниш</h2>
          <p className="mt-2 max-w-[640px] text-[15px] leading-6 text-brand-text-muted">Каждый шаблон — со своей палитрой, услугами и логикой записи. Посмотрите живой пример.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {ALL_NICHE_THEMES.map((t) => (
              <a
                key={t.key}
                href={`/dev/templates/${t.key}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 text-body-sm text-brand-text-muted transition-colors hover:text-brand-text"
              >
                <span className="size-2 rounded-full" style={{ background: t.accent }} aria-hidden="true" />
                {t.tagline}
              </a>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-[69rem] scroll-mt-24 px-4 py-10 md:px-6">
          <h2 className="!text-[28px] !font-semibold tracking-[-0.03em]">Тарифы</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-brand-border bg-brand-surface p-6">
              <div className="text-caption text-brand-text-muted">Подписка</div>
              <div className="mt-2 text-[34px] font-semibold leading-none">1 000 ₽<span className="text-[15px] font-normal text-brand-text-muted">/мес</span></div>
              <p className="mt-2 text-[13px] text-brand-text-muted">Сайт на нашем домене. Разовый запуск — 5 000 ₽.</p>
              <ul className="mt-4 space-y-1.5 text-[13px] text-brand-text-muted">
                <li>• Онлайн-запись и заявки</li>
                <li>• Обновления и хостинг</li>
                <li>• Свой домен — 2 500 ₽/мес</li>
              </ul>
              <a href="#partners" className="btn-primary mt-5 w-full text-body-sm">Оставить заявку</a>
            </div>
            <div className="rounded-3xl border border-brand-border bg-brand-surface p-6">
              <div className="text-caption text-brand-text-muted">Выкуп кода</div>
              <div className="mt-2 text-[34px] font-semibold leading-none">5 000 ₽<span className="text-[15px] font-normal text-brand-text-muted"> разово</span></div>
              <p className="mt-2 text-[13px] text-brand-text-muted">Забираете сайт-визитку и размещаете где удобно.</p>
              <ul className="mt-4 space-y-1.5 text-[13px] text-brand-text-muted">
                <li>• Код сайта-визитки</li>
                <li>• Данные услуг и контактов</li>
                <li>• Помощь с размещением</li>
              </ul>
              <a href="#partners" className="btn-secondary mt-5 w-full text-body-sm">Обсудить</a>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[69rem] px-4 py-12 md:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_50%_0%,rgb(var(--color-accent)/0.18),transparent_70%)]" aria-hidden="true" />
            <div className="relative">
              <h2 className="!text-[28px] !font-semibold tracking-[-0.03em]">Готовы запустить сайт?</h2>
              <p className="mx-auto mt-2 max-w-[520px] text-[15px] leading-6 text-brand-text-muted">Напишите нам — подберём шаблон под вашу нишу и покажем демо.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <a href="#pricing" className="btn-primary text-body-sm">Хочу сайт</a>
                <Link href="/auth" className="btn-secondary text-body-sm">Я партнёр</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter requisites={requisites} />
    </div>
  );
}

function SiteFooter({ requisites }: { requisites: Requisites }) {
  const contacts = [requisites.city, requisites.email].filter((v): v is string => Boolean(v));
  return (
    <footer className="border-t border-brand-border">
      <div className="mx-auto grid max-w-[69rem] gap-6 px-4 py-8 text-[13px] text-brand-text-muted md:grid-cols-2 md:px-6">
        <address className="not-italic leading-relaxed">
          <p className="text-brand-text">{operatorName(requisites)}</p>
          <p className="mt-1">{requisites.tax_status}</p>
          {contacts.length > 0 && <p className="mt-1">{contacts.join(' · ')}</p>}
        </address>
        <nav aria-label="Юридические документы">
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.values(LEGAL_DOCS).map((doc) => (
              <li key={doc.key}><Link href={doc.path} className="underline transition-colors hover:text-brand-text">{doc.title}</Link></li>
            ))}
            <li><Link href="/data-request" className="underline transition-colors hover:text-brand-text">Запрос о персональных данных</Link></li>
            <li><CookieSettingsButton className="min-h-[44px] underline" /></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
