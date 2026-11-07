// app/demo/business/page.tsx — витрина демо-кабинета предпринимателя.
// Ведёт в настоящую панель /m/demo/panel с реальными услугами, записями и настройками.
import Link from 'next/link';

export const metadata = { title: 'Демо-кабинет предпринимателя — Запишись', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function BusinessDemoPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="detailing-root min-h-screen">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-scoped.css" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-fonts.css" />

      <main className="mx-auto flex min-h-screen w-full max-w-[760px] flex-col justify-center px-4 py-10">
        <span className="w-fit rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3 py-1 text-caption text-brand-accent">
          ДЕМО
        </span>
        <h1 className="mt-4 text-heading-md">Кабинет предпринимателя — демо</h1>
        <p className="mt-3 text-body-sm text-brand-text-muted">
          Настоящая панель управления сайтом: услуги, записи клиентов, фото, тексты, настройки,
          оформление и подписка. Всё работает — данные можно менять, они сохраняются в демо-бизнесе.
        </p>

        <ul className="mt-5 space-y-2 text-body-sm text-brand-text-muted">
          <li>• <b className="text-brand-text">Записи</b> — новые, подтверждённые, выполненные и отменённые.</li>
          <li>• <b className="text-brand-text">Услуги</b> — добавление, цены, длительность, порядок.</li>
          <li>• <b className="text-brand-text">Фото и тексты</b> — галерея и содержимое сайта.</li>
          <li>• <b className="text-brand-text">Настройки</b> — контакты, часы работы, слоты, автоподтверждение.</li>
          <li>• <b className="text-brand-text">Оформление и подписка</b> — тема панели и тариф.</li>
        </ul>

        {searchParams.error && (
          <div className="mt-4 rounded-2xl border border-brand-error/40 bg-brand-error/10 px-4 py-2 text-body-sm text-brand-error">
            Не удалось открыть демо: {searchParams.error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <a href="/api/demo/owner" className="btn-primary press text-body-sm">Открыть демо-кабинет</a>
          <a href="/m/demo" className="btn-secondary press text-body-sm">Посмотреть сайт</a>
          <Link href="/demo" className="btn-ghost press text-body-sm">Все демо</Link>
        </div>

        <p className="mt-4 text-caption text-brand-text-subtle">
          Демо-доступ: <span className="font-mono">demo-owner@zapishisya.ru</span> / <span className="font-mono">demo12345</span>.
          Данные изолированы в демо-бизнесе и не влияют на реальные сайты.
        </p>
      </main>
    </div>
  );
}
