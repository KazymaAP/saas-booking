// app/page.tsx — лендинг сервиса (ТЗ §15).
import Link from 'next/link';

export const metadata = {
  title: 'Онлайн-запись для вашего бизнеса',
  description: 'Готовый сайт онлайн-записи для вашего бизнеса за 1 день. Работает на телефоне.',
};

const steps = ['Вы присылаете услуги, цены и фото', 'Мы делаем демо-сайт и показываем его', 'Вы одобряете и оплачиваете запуск', 'Клиенты записываются онлайн'];

export default function Home() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      <h1 className="text-[32px] font-bold md:text-[48px]">Онлайн-запись для вашего бизнеса. Готовый сервис за 1 день.</h1>
      <p className="mt-4 text-[#666666]">Клиенты записываются с телефона за несколько касаний, без звонков.</p>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-[#e5e5e5] p-4"><h2 className="font-semibold">Быстрый запуск</h2><p className="text-[#666666]">Сайт готов за день после получения данных.</p></div>
        <div className="rounded-md border border-[#e5e5e5] p-4"><h2 className="font-semibold">Работает на телефоне</h2><p className="text-[#666666]">Устанавливается на экран телефона, работает без App Store.</p></div>
        <div className="rounded-md border border-[#e5e5e5] p-4"><h2 className="font-semibold">Оплата помесячно</h2><p className="text-[#666666]">Разовый платёж и подписка, без скрытых платежей.</p></div>
      </section>

      <section className="mt-12">
        <h2 className="text-[24px] font-semibold">Как это работает</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-6">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </section>

      <section id="buy" className="mt-12">
        <h2 className="text-[24px] font-semibold">Цены</h2>
        <p className="mt-2">5 000 ₽ разово за сервис. Подписка 1 000 ₽ в месяц (сайт на нашем домене) или 2 500 ₽ в месяц (свой домен). Также доступен выкуп кода.</p>
        <p className="mt-4"><Link href="/oferta" className="underline">Оферта</Link> · <Link href="/privacy" className="underline">Политика конфиденциальности</Link></p>
      </section>
    </main>
  );
}
