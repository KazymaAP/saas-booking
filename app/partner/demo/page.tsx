// app/partner/demo/page.tsx — витрина демо-кабинета партнёра.
// Ведёт в настоящий кабинет с реальными данными (демо-аккаунт), а не в статичный макет.
import Link from 'next/link';

export const metadata = { title: 'Демо-кабинет партнёра — Запишись', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function PartnerDemoPage({ searchParams }: { searchParams: { error?: string } }) {
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
        <h1 className="mt-4 text-heading-md">Кабинет партнёра — демо</h1>
        <p className="mt-3 text-body-sm text-brand-text-muted">
          Это не скриншот и не статичные цифры. Откроется настоящий кабинет с данными в базе:
          лиды, счета, начисления, готовые сервисы и реферальная программа. Все действия работают
          по-настоящему — можно добавлять лиды, менять статусы, создавать счета.
        </p>

        <ul className="mt-5 space-y-2 text-body-sm text-brand-text-muted">
          <li>• <b className="text-brand-text">Лиды</b> — добавление, смена статуса, удаление.</li>
          <li>• <b className="text-brand-text">Счета</b> — три варианта сделки, расчёт комиссии.</li>
          <li>• <b className="text-brand-text">Начисления</b> — рекуррентные и разовые, статусы выплат.</li>
          <li>• <b className="text-brand-text">Готовые сервисы</b> — каталог, взятие в работу, текст первого сообщения.</li>
          <li>• <b className="text-brand-text">Мои партнёры</b> — второй уровень рефералки.</li>
        </ul>

        {searchParams.error && (
          <div className="mt-4 rounded-2xl border border-brand-error/40 bg-brand-error/10 px-4 py-2 text-body-sm text-brand-error">
            Не удалось открыть демо: {searchParams.error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <a href="/api/demo/partner" className="btn-primary press text-body-sm">Открыть демо-кабинет</a>
          <Link href="/partner" className="btn-secondary press text-body-sm">Боевой кабинет</Link>
          <Link href="/demo" className="btn-ghost press text-body-sm">Все демо</Link>
        </div>

        <p className="mt-4 text-caption text-brand-text-subtle">
          Демо-аккаунт отдельный: ваши реальные данные и настоящие партнёры не затрагиваются.
          Демо-доступ: <span className="font-mono">demo-partner@zapishisya.ru</span> / <span className="font-mono">demo12345</span>.
        </p>
      </main>
    </div>
  );
}
