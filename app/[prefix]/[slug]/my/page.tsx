// app/[prefix]/[slug]/my/page.tsx — кабинет клиента «Мои записи» (NEW-5, 2026-11-12).
// Работает всегда: без сессии показывает приглашение войти, с сессией — записи клиента по customer_id.
// Проверка сессии — здесь, в server component; middleware /my не блокирует (публичный маршрут).
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { resolveBusiness } from '@/lib/business';
import { businessTimeZone } from '@/lib/availability';
import { adminClient } from '@/lib/supabase';
import { readCustomerSession } from '@/lib/customer-session';
import { formatSlotDateTime } from '@/lib/slots';
import { customerLogoutAction } from './actions';

export const dynamic = 'force-dynamic';

type BookingRow = {
  id: string;
  scheduled_at: string;
  status: string;
  service_id: string | null;
  cancel_token: string;
  services: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  cancelled: 'Отменена',
  done: 'Завершена',
  no_show: 'Не явился',
};

const ACTIVE_STATUSES = new Set(['new', 'confirmed']);

export default async function MyBookingsPage({ params }: { params: { prefix: string; slug: string } }) {
  const r = await resolveBusiness(params.prefix, params.slug);
  // Бизнес живёт под префиксом своей ниши: /b/2bro/my → /d/2bro/my. Раньше эта страница
  // отдавала 404 на неверном префиксе, хотя /{prefix}/{slug} уже редиректил — клиент,
  // открывший старую ссылку на «Мои записи», видел «страницы нет».
  if (r.kind === 'redirect') permanentRedirect(`${r.to}/my`);
  if (r.kind === 'notfound') notFound();
  const businessId = r.business.id;

  const session = await readCustomerSession(businessId);

  if (!session) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-12">
        <h1 className="text-[26px] font-semibold">Мои записи</h1>
        <p className="mt-4 text-[15px] text-[#595959]">
          Войдите в кабинет, чтобы видеть свои записи, отменять и переносить их.
        </p>
        <Link
          href={`/${params.prefix}/${params.slug}/my/login`}
          className="mt-6 inline-flex min-h-[44px] items-center rounded-md bg-[var(--accent,#111)] px-5 text-white"
        >
          Войти в кабинет
        </Link>
      </main>
    );
  }

  const { data: bookings } = await adminClient()
    .from('bookings')
    .select('id, scheduled_at, status, service_id, cancel_token, services(name)')
    .eq('business_id', businessId)
    .eq('customer_id', session.customer.id)
    .order('scheduled_at', { ascending: false })
    .returns<BookingRow[]>();

  // Время показываем в поясе бизнеса, а не сервера: иначе клиент видит UTC и приходит не в тот час.
  const timeZone = businessTimeZone(r.business);

  return (
    <main className="mx-auto max-w-[640px] px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[26px] font-semibold">Мои записи</h1>
        <form action={customerLogoutAction}>
          <button type="submit" className="min-h-[40px] rounded-md border border-[#e5e5e5] px-4 text-[14px]">
            Выйти
          </button>
        </form>
      </div>
      <p className="mt-1 text-[14px] text-[#595959]">{session.customer.email}</p>

      {bookings && bookings.length > 0 ? (
        <ul className="mt-6 grid gap-3">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-lg border border-[#e5e5e5] p-4">
              <div className="text-[15px] font-medium">{b.services?.name ?? 'Услуга'}</div>
              <div className="mt-1 text-[14px] text-[#595959]">{formatSlotDateTime(b.scheduled_at, timeZone)}</div>
              <div className="mt-1 text-[13px] text-[#737373]">{STATUS_LABEL[b.status] ?? b.status}</div>
              {ACTIVE_STATUSES.has(b.status) && (
                <div className="mt-3 flex flex-wrap gap-4 text-[14px]">
                  <a href={`/booking/reschedule/${b.cancel_token}`} className="underline">Перенести</a>
                  <a href={`/booking/cancel/${b.cancel_token}`} className="underline">Отменить</a>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-[15px] text-[#595959]">У вас пока нет записей в «{r.business.name}».</p>
      )}
    </main>
  );
}
