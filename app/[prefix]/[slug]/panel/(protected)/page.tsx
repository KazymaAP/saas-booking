// app/[prefix]/[slug]/panel/(protected)/page.tsx — дашборд и онбординг (ТЗ §13.9, §13.13, §19.1, design-spec §7.2).
// Серверный компонент. Все счётчики — один параллельный батч head-запросов (count без строк), N+1 нет.
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { logError } from '@/lib/log';
import { businessTimeZone } from '@/lib/availability';
import { addDays, dayBoundsUtc, localDateOf } from '@/lib/slots';
import { requirePageAccess, isOwner } from './_lib/access';
import { buildChecklist, progressPercent, type ChecklistItem } from './_lib/onboarding';
import { panelBase } from './_lib/sections';
import { DAY_MS } from './_lib/time';
import { BookingList, type BookingRow } from './bookings/BookingList';
import { OnboardingTip } from './_components/OnboardingTip';
import { DashboardBookings } from './DashboardBookings';
import { ManualBookingForm } from './ManualBookingForm';
import { BOOKING_ROW_SELECT, toBookingRow, type BookingDbRow } from './bookings/rows';

export const dynamic = 'force-dynamic';

const ACTIVE = ['new', 'confirmed'];
const WEEK_DAYS = 7;
// Сколько неподтверждённых записей показать прямо на главной: подтвердить можно, не открывая «Брони».
const PENDING_PREVIEW = 5;

type Counts = {
  today: number; week: number; pending: number; services: number; photos: number;
  doneToday: number; revenueToday: number; revenueWeek: number;
};
type PaymentRow = { id: string; amount: number; type: string; paid_at: string; note: string | null };
type ServiceOption = { id: string; name: string; price: number };
type Dashboard = {
  counts: Counts;
  pendingRows: BookingRow[];
  todayRows: BookingRow[];
  weekRows: BookingRow[];
  payments: PaymentRow[];
  serviceOptions: ServiceOption[];
};

const PAYMENT_LABELS: Record<string, string> = {
  initial_5000: 'Первый платёж',
  subscription: 'Подписка',
  code_buyout: 'Выкуп кода',
  other: 'Прочее',
};

const REVENUE_PAGE = 1000;

/**
 * Выручка по завершённым визитам за период. PostgREST не умеет SUM без RPC, поэтому читаем
 * страницами: один `.limit(1000)` молча занижал выручку у загруженного бизнеса.
 * Верхняя граница 20 000 визитов за неделю — защита от бесконечного цикла при сбое БД.
 */
async function loadDoneRevenue(
  businessId: string,
  fromIso: string,
  toIso: string,
): Promise<{
  data: { scheduled_at: string; price_at_booking: number | null }[] | null;
  error: { message?: string } | null;
}> {
  const db = adminClient();
  const rows: { scheduled_at: string; price_at_booking: number | null }[] = [];
  for (let offset = 0; offset < 20_000; offset += REVENUE_PAGE) {
    const { data, error } = await db
      .from('bookings')
      .select('scheduled_at, price_at_booking')
      .eq('business_id', businessId)
      .eq('status', 'done')
      .gte('scheduled_at', fromIso)
      .lt('scheduled_at', toIso)
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + REVENUE_PAGE - 1);
    if (error) return { data: null, error };
    const page = (data ?? []) as { scheduled_at: string; price_at_booking: number | null }[];
    rows.push(...page);
    if (page.length < REVENUE_PAGE) return { data: rows, error: null };
  }
  return { data: rows, error: null };
}

// Счётчики — head (строки не передаются); неподтверждённые — первые 5 строк и общее количество
// в одном запросе (count: exact + limit). Ошибка основного запроса → error.tsx: «0 записей»
// и «услуги не заполнены» при сбое БД ввели бы в заблуждение.
async function loadDashboard(businessId: string, now: number, timeZone: string): Promise<Dashboard> {
  const db = adminClient();
  // Границы дня считаем в поясе бизнеса, а не «UTC+3 навсегда»: у Калининграда и Владивостока
  // сутки начинаются в другой UTC-момент, а при DST день может быть 23 или 25 часов.
  const localDate = localDateOf(now, timeZone);
  const dayStart = dayBoundsUtc(localDate, timeZone)?.start ?? now - DAY_MS;
  const dayEnd = dayBoundsUtc(addDays(localDate, 1), timeZone)?.start ?? dayStart + DAY_MS;
  const weekEnd = dayBoundsUtc(addDays(localDate, WEEK_DAYS), timeZone)?.start ?? dayStart + WEEK_DAYS * DAY_MS;
  // Выручка «за неделю» — прошедшие 7 календарных дней включая сегодня, а не будущие записи:
  // завершённых (`done`) визитов в будущем почти не бывает, цифра была бы всегда нулевой.
  const weekAgoStart = dayBoundsUtc(addDays(localDate, -(WEEK_DAYS - 1)), timeZone)?.start ?? dayStart - (WEEK_DAYS - 1) * DAY_MS;
  const iso = (ms: number) => new Date(ms).toISOString();
  const bookings = () => db.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
  // Дополнительные блоки (как в старом кабинете Детейленг): выручка, список записей за
  // сегодня/неделю, платежи, ручное добавление. Их ошибки НЕ роняют дашборд: на старой схеме
  // части колонок может не быть, и тогда блок просто покажет пустые значения.
  const extra = () => db.from('bookings').select(BOOKING_ROW_SELECT).eq('business_id', businessId);
  const [today, week, pending, services, photos, doneRows, todayRows, weekRows, payments, serviceRows] = await Promise.all([
    bookings().in('status', ACTIVE).gte('scheduled_at', iso(dayStart)).lt('scheduled_at', iso(dayEnd)),
    bookings().in('status', ACTIVE).gte('scheduled_at', iso(now)).lt('scheduled_at', iso(weekEnd)),
    db.from('bookings').select(BOOKING_ROW_SELECT, { count: 'exact' }).eq('business_id', businessId).eq('status', 'new')
      .gte('scheduled_at', iso(now)).order('scheduled_at', { ascending: true }).limit(PENDING_PREVIEW).returns<BookingDbRow[]>(),
    db.from('services').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('is_active', true),
    db.from('photos').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    loadDoneRevenue(businessId, iso(weekAgoStart), iso(dayEnd)),
    extra().in('status', ['new', 'confirmed', 'done']).gte('scheduled_at', iso(dayStart)).lt('scheduled_at', iso(dayEnd))
      .order('scheduled_at', { ascending: true }).limit(100).returns<BookingDbRow[]>(),
    extra().in('status', ['new', 'confirmed', 'done']).gte('scheduled_at', iso(dayStart)).lt('scheduled_at', iso(weekEnd))
      .order('scheduled_at', { ascending: true }).limit(200).returns<BookingDbRow[]>(),
    db.from('payments').select('id, amount, type, paid_at, note').eq('business_id', businessId)
      .order('paid_at', { ascending: false }).limit(5),
    db.from('services').select('id, name, price').eq('business_id', businessId).eq('is_active', true)
      .order('sort_order', { ascending: true }).limit(50),
  ]);
  const main = { today, week, pending, services, photos };
  const brokenMain = Object.entries(main).filter(([, r]) => r.error).map(([key, r]) => `${key}: ${r.error?.message ?? 'ошибка'}`);
  if (brokenMain.length > 0) {
    await logError('admin', 'panel: dashboard load failed', { business: businessId, detail: brokenMain.join('; ') });
    throw new Error('dashboard: load failed');
  }
  // Дополнительные блоки не роняют страницу, но сбой не должен выглядеть как честные нули:
  // пишем в журнал, чтобы «0 ₽» не принимали за реальную выручку.
  const optional = { doneRows, todayRows, weekRows, payments, serviceRows };
  const brokenOptional = Object.entries(optional).filter(([, r]) => r.error).map(([key, r]) => `${key}: ${r.error?.message ?? 'ошибка'}`);
  if (brokenOptional.length > 0) {
    await logError('admin', 'panel: dashboard partial load', { business: businessId, detail: brokenOptional.join('; ') });
  }

  const done = doneRows.data ?? [];
  const todayDone = done.filter((r) => {
    const ms = new Date(r.scheduled_at).getTime();
    return ms >= dayStart && ms < dayEnd;
  });
  const revenueToday = todayDone.reduce((sum, r) => sum + (Number(r.price_at_booking) || 0), 0);
  const revenueWeek = done.reduce((sum, r) => sum + (Number(r.price_at_booking) || 0), 0);

  return {
    counts: {
      today: today.count ?? 0, week: week.count ?? 0, pending: pending.count ?? 0,
      services: services.count ?? 0, photos: photos.count ?? 0,
      doneToday: todayDone.length,
      revenueToday, revenueWeek,
    },
    pendingRows: (pending.data ?? []).map(toBookingRow),
    todayRows: (todayRows.data ?? []).map(toBookingRow),
    weekRows: (weekRows.data ?? []).map(toBookingRow),
    payments: (payments.data ?? []) as PaymentRow[],
    serviceOptions: (serviceRows.data ?? []) as ServiceOption[],
  };
}

export default async function OwnerHome({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requirePageAccess(params);
  const b = access.business;
  const base = panelBase(params);
  const now = Date.now();
  const timeZone = businessTimeZone(b);
  const { counts, pendingRows, todayRows, weekRows, payments, serviceOptions } = await loadDashboard(b.id, now, timeZone);

  const checklist = buildChecklist({ activeServices: counts.services, photos: counts.photos, business: b });
  const percent = progressPercent(checklist);

  // ТЗ §13.13: после заполнения — onboarding_completed_at. Условный update идемпотентен и выполняется один раз за жизнь бизнеса.
  // Сбой записи не ломает дашборд (отметка повторится при следующем открытии), но пишется в журнал.
  if (isOwner(access) && percent === 100 && !b.onboarding_completed_at) {
    const { error } = await adminClient().from('businesses').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', b.id).is('onboarding_completed_at', null);
    if (error) await logError('booking', 'panel: onboarding_completed_at not saved', { business_id: b.id, code: error.code });
  }

  const owner = isOwner(access);
  const showChecklist = owner && percent < 100;

  return (
    <div className="grid gap-8">
      {/* Шапка: бренд бизнеса + быстрые ссылки, как в старом кабинете, но в нашем стиле. */}
      <header
        className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--line)] p-5"
        style={{ background: 'color-mix(in srgb, var(--brand-color) 8%, var(--surface))' }}
      >
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-full text-[18px] font-semibold text-[var(--on-accent)]"
            style={{ background: 'var(--brand-color)' }}
          >
            {b.name.trim().charAt(0).toUpperCase() || '•'}
          </span>
          <div className="min-w-0">
            <p className="!mb-1 text-[14px] text-[var(--muted)]">Панель владельца · {b.slug}</p>
            <h1 className="!mb-0 truncate">{b.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${params.prefix}/${params.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 !no-underline">Открыть сайт ↗</Link>
          {owner && <Link href={`${base}/settings`} className="inline-flex min-h-[40px] items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 !no-underline">Настройки</Link>}
        </div>
      </header>

      {showChecklist && percent === 0 && (
        <section aria-labelledby="welcome-title" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 id="welcome-title">Добро пожаловать!</h2>
          <p className="text-[14px] text-[var(--muted)]">Заполните 4 пункта ниже — и сайт готов принимать записи.</p>
        </section>
      )}

      {/* Одноразовая подсказка (localStorage, ТЗ §13.13): что главное на этом экране. */}
      <OnboardingTip slug={params.slug} tip="dashboard" title="Здесь — главное за день">
        Карточки ведут в «Брони». Новые записи можно подтвердить прямо на главной — клиент получит письмо.
      </OnboardingTip>

      {/* Сводка дня: записи, выполненные и выручка. Выручка считается по завершённым записям. */}
      <section aria-label="Сводка" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard href={`${base}/bookings`} label="Записей сегодня" value={counts.today} />
        <StatCard href={`${base}/bookings`} label="Завершено сегодня" value={counts.doneToday} />
        <StatCard label="Выручка сегодня" value={money(counts.revenueToday)} />
        <StatCard label="Выручка за 7 дней" value={money(counts.revenueWeek)} accent />
        <StatCard href={`${base}/bookings`} label="На 7 дней" value={counts.week} />
        <StatCard href={`${base}/bookings`} label="Ждут подтверждения" value={counts.pending} accent={counts.pending > 0} />
      </section>

      <DashboardBookings slug={params.slug} todayRows={todayRows} weekRows={weekRows} now={now} />

      <ManualBookingForm slug={params.slug} services={serviceOptions} timeZone={timeZone} />

      <section aria-labelledby="payments-title" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="payments-title" className="!mb-0">Платежи платформе</h2>
          <Link href={`${base}/subscription`} className="text-[14px]">Тариф и подписка →</Link>
        </div>
        <p className="!mb-0 mt-1 text-[13px] text-[var(--muted)]">Оплата подписки и услуг платформы. Оплату клиентов за визиты смотрите в выручке выше.</p>
        {payments.length === 0 ? (
          <p className="!mb-0 mt-3 text-[14px] text-[var(--muted)]">Платежей пока нет.</p>
        ) : (
          <ul className="mt-3 grid gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-[14px]">
                <span>{PAYMENT_LABELS[p.type] ?? p.type}{p.note ? ` · ${p.note}` : ''}</span>
                <span className="flex items-center gap-3">
                  <span className="text-[13px] text-[var(--muted)]">{paymentDate(p.paid_at, timeZone)}</span>
                  <b>{money(Number(p.amount))}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingRows.length > 0 && (
        <section aria-labelledby="pending-title" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="pending-title" className="!mb-0">Ждут подтверждения</h2>
            {counts.pending > pendingRows.length && (
              <Link href={`${base}/bookings`} className="text-[14px]">Все {counts.pending} →</Link>
            )}
          </div>
          {/* Тот же список, что в «Бронях»: optimistic-кнопки, откат и toast. После подтверждения запись уходит отсюда. */}
          <BookingList slug={params.slug} rows={pendingRows} now={now} groupHeading="h3" emptyText="Все записи подтверждены" />
        </section>
      )}

      {showChecklist && <Checklist base={base} items={checklist} percent={percent} />}

      <nav aria-label="Быстрые действия" className="flex flex-wrap gap-2">
        <Link href={`${base}/bookings`} className="btn-primary !no-underline">Открыть брони</Link>
        {owner && <Link href={`${base}/settings`} className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 !no-underline">Настройки</Link>}
      </nav>
    </div>
  );
}

function money(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

/** Дата платежа в поясе бизнеса: на Vercel сервер в UTC, иначе дата уезжала на день. */
function paymentDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

function Checklist({ base, items, percent }: { base: string; items: ChecklistItem[]; percent: number }) {
  const doneCount = items.filter((c) => c.done).length;
  return (
    <section aria-labelledby="onboarding-title" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <h2 id="onboarding-title">Готовность сайта: {percent}%</h2>
      <div
        role="progressbar"
        aria-labelledby="onboarding-title"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`Выполнено ${doneCount} из ${items.length}`}
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--soft)]"
      >
        <div className="h-2 rounded-full" style={{ width: `${percent}%`, background: 'var(--brand-color)' }} />
      </div>
      <ol className="mt-4 grid gap-2">
        {items.map((c) => (
          <li key={c.key}>
            <Link
              href={`${base}/${c.path}`}
              className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 !no-underline ${c.done ? 'border-[var(--line)] bg-[var(--soft)]' : 'border-[var(--line)] hover:bg-[var(--soft)]'}`}
            >
              <CheckIcon done={c.done} />
              <span className="grid">
                <span className={c.done ? 'text-[var(--muted)] line-through decoration-1' : 'font-medium'}>{c.label}</span>
                {!c.done && <span className="text-[13px] text-[var(--muted)]">{c.hint}</span>}
              </span>
              {/* Статус текстом — цвет не единственный признак (design-spec §9). */}
              <span className="ml-auto shrink-0 text-[13px] text-[var(--muted)]">{c.done ? 'Готово' : 'Заполнить →'}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StatCard({ href, label, value, accent = false }: { href?: string; label: string; value: number | string; accent?: boolean }) {
  const content = (
    <>
      <span className="block text-[13px] text-[var(--muted)]">{label}</span>
      <span className={`block text-[26px] font-bold leading-tight ${accent ? 'text-[var(--brand-color)]' : ''}`}>{value}</span>
    </>
  );
  const cls = 'block rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 !no-underline hover:bg-[var(--soft)]';
  return href ? <Link href={href} className={cls}>{content}</Link> : <div className={cls}>{content}</div>;
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="12" r="10" fill={done ? '#16a34a' : 'none'} stroke={done ? '#16a34a' : '#a3a3a3'} strokeWidth="2" />
      {done && <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
