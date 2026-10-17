// app/data-request/page.tsx — запрос субъекта ПД: доступ, исправление, удаление, отзыв согласия, отказ от писем
// (ТЗ 4.0 §15.4; ст. 9 ч. 2, ст. 14, 20, 21 ФЗ-152). Server Component; интерактивна только форма.
import type { Metadata } from 'next';
import Link from 'next/link';
import { DATA_REQUEST_ANSWER_DAYS, DATA_REQUEST_EXTENSION_DAYS, getRequisites, operatorName } from '@/lib/legal';
import { DataRequestForm } from './DataRequestForm';

// Реквизиты в шапке кэшируются на 24 часа, как и в документах.
export const revalidate = 86400;

// Служебная страница: в поиске не нужна (в ней нет содержания, а форма притягивает спам).
export const metadata: Metadata = {
  title: 'Запрос о персональных данных',
  description: 'Узнать, исправить или удалить свои персональные данные, отозвать согласие, отказаться от писем.',
  robots: { index: false, follow: true },
};

export default async function DataRequestPage() {
  const requisites = await getRequisites();
  return (
    <main id="main-content" className="mx-auto max-w-[640px] px-4 py-8 md:px-8">
      <p className="text-[14px]"><Link href="/" className="underline">На главную</Link></p>
      <h1 className="mt-4 text-[28px] font-bold leading-tight md:text-[32px]">Запрос о персональных данных</h1>
      <div className="mt-3 grid gap-3 leading-relaxed">
        <p>
          Через эту форму можно узнать, какие ваши данные обрабатываются, исправить или удалить их, отозвать согласие
          или отказаться от писем. Запрос рассматривает {operatorName(requisites)}.
        </p>
        <p>
          Ответим в течение {DATA_REQUEST_ANSWER_DAYS} рабочих дней. Если потребуется больше времени, предупредим
          и продлим срок не более чем на {DATA_REQUEST_EXTENSION_DAYS} рабочих дней (ст. 14, 20 ФЗ-152).
          Если вы записывались к конкретному бизнесу, он — оператор ваших данных; мы передадим ему запрос и поможем ответить.
        </p>
      </div>

      <DataRequestForm />

      <section aria-labelledby="dr-contacts" className="mt-10 border-t border-[#e5e5e5] pt-4 text-[14px]">
        <h2 id="dr-contacts" className="text-[16px] font-semibold">Контакты</h2>
        <p className="mt-2">
          Запрос можно отправить и письмом:{' '}
          {requisites.email
            ? <a href={`mailto:${requisites.email}`} className="underline">{requisites.email}</a>
            : 'адрес будет опубликован в разделе «Реквизиты» политики'}
          . Подробнее — в <Link href="/privacy#rights" className="underline">Политике обработки персональных данных</Link>.
        </p>
      </section>
    </main>
  );
}
