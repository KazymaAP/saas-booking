// app/[prefix]/[slug]/booking/cancel/[token]/page.tsx — отмена по ссылке из письма (ТЗ §10.4).
// Состояние определяется ДО показа кнопки: если до записи меньше cancel_hours_before — кнопки нет,
// сразу телефон бизнеса. Отмена — server action (lib/booking-action-state → lib/booking-actions).
import { loadBookingView, type BookingView } from '@/lib/booking-view';
import { BookingSummary, NotFoundNotice, Notice, PageShell } from '../../booking-page-ui';
import { CancelForm } from './CancelForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Отмена записи', robots: { index: false, follow: false } };

type Params = { prefix: string; slug: string; token: string };

function body(view: BookingView, token: string) {
  if (view.state === 'cancelled') return <Notice text="Эта запись уже отменена." phone={null} />;
  if (view.state === 'closed') return <Notice text="Эту запись нельзя отменить онлайн." phone={view.phone} />;
  if (view.state === 'too_late') {
    return <Notice text={`Онлайн-отмена доступна не позднее чем за ${view.cancelHours} ч до записи. Позвоните, пожалуйста.`} phone={view.phone} />;
  }
  return (
    <>
      <CancelForm token={token} when={view.when} />
      <p className="mt-4 text-[14px] text-[#595959]">Отмена возможна не позднее чем за {view.cancelHours} ч до записи.</p>
    </>
  );
}

export default async function CancelPage({ params }: { params: Params }) {
  const view = await loadBookingView(params.token, 'cancel', params.slug);
  return (
    <PageShell title="Отмена записи">
      {view === null ? (
        <NotFoundNotice />
      ) : (
        <>
          <BookingSummary view={view} />
          {body(view, params.token)}
        </>
      )}
    </PageShell>
  );
}
