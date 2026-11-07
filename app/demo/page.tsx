// app/demo/page.tsx — индекс демо-кабинетов: партнёр и предприниматель.
import Link from 'next/link';

export const metadata = { title: 'Демо-кабинеты — Запишись', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function DemoIndexPage() {
  return (
    <div className="detailing-root min-h-screen">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-scoped.css" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-fonts.css" />

      <main className="mx-auto flex min-h-screen w-full max-w-[900px] flex-col justify-center px-4 py-10">
        <span className="w-fit rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3 py-1 text-caption text-brand-accent">
          ДЕМО
        </span>
        <h1 className="mt-4 text-heading-md">Демо-кабинеты платформы</h1>
        <p className="mt-3 text-body-sm text-brand-text-muted">
          Два рабочих кабинета с реальными данными. Это не макеты: действия сохраняются в базе
          и изолированы в отдельных демо-аккаунтах.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
            <h2 className="text-heading-sm">Партнёр</h2>
            <p className="mt-2 text-body-sm text-brand-text-muted">
              Лиды, счета, начисления, готовые сервисы и реферальная программа.
            </p>
            <a href="/api/demo/partner" className="btn-primary press mt-4 inline-flex text-body-sm">Открыть демо</a>
            <Link href="/partner/demo" className="mt-2 block text-caption text-brand-accent underline">Подробнее о демо →</Link>
          </section>

          <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
            <h2 className="text-heading-sm">Предприниматель</h2>
            <p className="mt-2 text-body-sm text-brand-text-muted">
              Записи, услуги, фото, тексты, настройки, оформление и подписка.
            </p>
            <a href="/api/demo/owner" className="btn-primary press mt-4 inline-flex text-body-sm">Открыть демо</a>
            <Link href="/demo/business" className="mt-2 block text-caption text-brand-accent underline">Подробнее о демо →</Link>
          </section>
        </div>
      </main>
    </div>
  );
}
