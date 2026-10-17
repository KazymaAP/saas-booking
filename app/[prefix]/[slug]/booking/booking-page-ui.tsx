// Общая разметка страниц отмены и переноса (Server Components, без клиентского JS).
import type { ReactNode } from 'react';
import type { BookingView } from '@/lib/booking-view';

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[520px] px-4 py-10">
      <h1 className="text-[24px] font-semibold">{title}</h1>
      {children}
    </main>
  );
}

// Карточка записи: что, где, когда. <dl> — диктор читает пары «название — значение».
export function BookingSummary({ view }: { view: BookingView }) {
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border border-[#e5e5e5] bg-white p-4 text-[15px]">
      {view.serviceName ? (
        <>
          <dt className="text-[#595959]">Услуга</dt>
          <dd className="m-0">{view.serviceName}</dd>
        </>
      ) : null}
      <dt className="text-[#595959]">Где</dt>
      <dd className="m-0">{view.businessName}</dd>
      <dt className="text-[#595959]">Когда</dt>
      <dd className="m-0">
        <time dateTime={view.startsAt}>{view.when}</time>
      </dd>
    </dl>
  );
}

// Сообщение без действия (поздно, уже отменено, лимит). Телефон — ссылкой tel:, это главный выход.
export function Notice({ text, phone }: { text: string; phone: string | null }) {
  return (
    <div role="status" className="mt-6 rounded-xl bg-[#f5f5f5] p-4">
      <p className="m-0">{text}</p>
      {phone ? (
        <p className="m-0 mt-2">
          <a href={telHref(phone)} className="btn-primary min-h-[44px] no-underline">
            Позвонить {phone}
          </a>
        </p>
      ) : null}
    </div>
  );
}

export function NotFoundNotice() {
  return <Notice text="Запись не найдена. Проверьте ссылку из письма." phone={null} />;
}
