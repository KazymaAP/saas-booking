// app/[prefix]/[slug]/booking/reschedule/[token]/page.tsx — перенос записи по ссылке из письма (ТЗ §10.5).
// Состояние вычисляется ДО показа формы (lib/booking-view): уже отменена, поздно (меньше cancel_hours_before),
// исчерпан лимит переносов (max_reschedules) — тогда формы нет, есть телефон бизнеса.
// Один запрос к БД (бронь + услуга + бизнес), счётчик переносов — только если форма будет показана.
import { loadBookingView, type BookingView } from '@/lib/booking-view';
import { BookingSummary, NotFoundNotice, Notice, PageShell } from '../../booking-page-ui';
import { RescheduleForm } from './RescheduleForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Перенос записи', robots: { index: false, follow: false } };

type Params = { prefix: string; slug: string; token: string };

function body(view: BookingView, params: Params) {
  if (view.state === 'cancelled') return <Notice text="Эта запись отменена — перенести её нельзя." phone={null} />;
  if (view.state === 'closed') return <Notice text="Эту запись нельзя перенести онлайн." phone={view.phone} />;
  if (view.state === 'too_late') {
    return <Notice text={`Онлайн-перенос доступен не позднее чем за ${view.cancelHours} ч до записи. Позвоните, пожалуйста.`} phone={view.phone} />;
  }
  if (view.state === 'limit') {
    return <Notice text="Запись уже переносили максимальное число раз. Позвоните, пожалуйста." phone={view.phone} />;
  }
  if (view.serviceId === null) return <Notice text="Услуга этой записи больше недоступна. Позвоните, пожалуйста." phone={view.phone} />;
  return (
    <>
      <RescheduleForm
        token={params.token}
        serviceId={view.serviceId}
        prefix={params.prefix}
        slug={params.slug}
        schedule={view.schedule}
        currentStartsAt={view.startsAt}
      />
      <p className="mt-6 text-[14px] text-[#595959]">
        Перенос возможен не позднее чем за {view.cancelHours} ч до записи. Осталось переносов: {view.reschedulesLeft}.
      </p>
    </>
  );
}

export default async function ReschedulePage({ params }: { params: Params }) {
  const view = await loadBookingView(params.token, 'reschedule', params.slug);
  return (
    <PageShell title="Перенос записи">
      {view === null ? (
        <NotFoundNotice />
      ) : (
        <>
          <BookingSummary view={view} />
          {body(view, params)}
        </>
      )}
    </PageShell>
  );
}
