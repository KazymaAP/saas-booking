// app/[prefix]/[slug]/panel/(protected)/bookings/page.tsx — брони бизнеса (ТЗ §5.3, §10.7, §13.9).
// Серверный: один запрос списка, строки форматируются здесь (часовой пояс бизнеса), кнопки — в клиентском BookingList.
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { requirePageAccess } from '../_lib/access';
import { panelBase } from '../_lib/sections';
import { businessDayStart, DAY_MS } from '../_lib/time';
import { OnboardingTip } from '../_components/OnboardingTip';
import { BookingList, type BookingRow } from './BookingList';
import { BOOKING_ROW_SELECT, toBookingRow, type BookingDbRow } from './rows';

export const dynamic = 'force-dynamic';

const FILTERS = ['upcoming', 'all'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = { upcoming: 'Предстоящие', all: 'Все за 30 дней' };
const EMPTY_TEXT: Record<Filter, string> = { upcoming: 'Предстоящих записей нет', all: 'За 30 дней записей нет' };
// «Все» — окно назад, чтобы видеть недавние выполненные/неявки; больше — через CSV в разделе «Данные».
const HISTORY_DAYS = 30;
const LIST_LIMIT = 200;

function parseFilter(v: string | undefined): Filter {
  return v === 'all' ? 'all' : 'upcoming';
}

async function loadBookings(businessId: string, filter: Filter, now: number): Promise<BookingRow[] | null> {
  // Предстоящие — с начала сегодняшнего дня по Москве: запись на 10:00 не исчезает в 10:01, её ещё нужно отметить.
  const from = filter === 'all' ? businessDayStart(now) - HISTORY_DAYS * DAY_MS : businessDayStart(now);
  let q = adminClient()
    .from('bookings')
    .select(BOOKING_ROW_SELECT)
    .eq('business_id', businessId)
    .gte('scheduled_at', new Date(from).toISOString())
    .order('scheduled_at', { ascending: filter === 'upcoming' })
    .limit(LIST_LIMIT);
  if (filter === 'upcoming') q = q.in('status', ['new', 'confirmed']);
  const { data, error } = await q.returns<BookingDbRow[]>();
  if (error) return null;
  return (data ?? []).map(toBookingRow);
}

export default async function BookingsPage({ params, searchParams }: { params: { prefix: string; slug: string }; searchParams: { filter?: string } }) {
  const access = await requirePageAccess(params);
  const filter = parseFilter(searchParams.filter);
  // «Сейчас» — одно на сервере: и для выборки, и для кнопок (без расхождения сервер/клиент при гидрации).
  const now = Date.now();
  const rows = await loadBookings(access.business.id, filter, now);
  // Ошибка БД — в error boundary раздела (кнопка «Попробовать ещё раз»), а не пустой список «броней нет».
  if (!rows) throw new Error('bookings: load failed');
  const base = `${panelBase(params)}/bookings`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="!mb-0">Брони</h1>
        <nav aria-label="Фильтр броней">
          <ul className="flex gap-1 rounded-lg border border-[#e5e5e5] bg-[var(--surface)] p-1">
            {FILTERS.map((f) => (
              <li key={f}>
                <Link
                  href={`${base}?filter=${f}`}
                  prefetch
                  scroll={false}
                  aria-current={f === filter ? 'page' : undefined}
                  className={`flex min-h-[44px] items-center rounded-md px-3 text-[14px] !no-underline md:min-h-[36px] ${f === filter ? 'bg-[#f0f0f0] font-semibold' : 'hover:bg-[#f6f6f6]'}`}
                >
                  {FILTER_LABEL[f]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <OnboardingTip slug={params.slug} tip="bookings" title="Как работать с бронями">
        «Подтвердить» отправляет клиенту письмо. После визита отметьте «Выполнено» или «Не пришёл» — это видно в статистике.
      </OnboardingTip>
      {rows.length === LIST_LIMIT && (
        <p className="!mb-0 text-[13px] text-[#595959]">Показаны первые {LIST_LIMIT} записей. Полный список — CSV в разделе «Данные» (у владельца).</p>
      )}
      {/* key: при смене фильтра сбрасываем optimistic-состояние и объявления списка. */}
      <BookingList key={filter} slug={params.slug} rows={rows} now={now} emptyText={EMPTY_TEXT[filter]} />
    </div>
  );
}
