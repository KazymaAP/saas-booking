// app/[prefix]/[slug]/panel/(protected)/page.tsx — дашборд и онбординг (ТЗ §13.9, §13.13, §19.1, design-spec §7.2).
// Серверный компонент. Все счётчики — один параллельный батч head-запросов (count без строк), N+1 нет.
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { logError } from '@/lib/log';
import { requirePageAccess, isOwner } from './_lib/access';
import { buildChecklist, progressPercent, type ChecklistItem } from './_lib/onboarding';
import { panelBase } from './_lib/sections';
import { businessDayStart, DAY_MS } from './_lib/time';
import { BookingList, type BookingRow } from './bookings/BookingList';
import { OnboardingTip } from './_components/OnboardingTip';
import { BOOKING_ROW_SELECT, toBookingRow, type BookingDbRow } from './bookings/rows';

export const dynamic = 'force-dynamic';

const ACTIVE = ['new', 'confirmed'];
const WEEK_DAYS = 7;
// Сколько неподтверждённых записей показать прямо на главной: подтвердить можно, не открывая «Брони».
const PENDING_PREVIEW = 5;

type Counts = { today: number; week: number; pending: number; services: number; photos: number };
type Dashboard = { counts: Counts; pendingRows: BookingRow[] };

// Пять запросов одним параллельным батчем. Счётчики — head (строки не передаются); неподтверждённые —
// первые 5 строк и общее количество в одном запросе (count: exact + limit).
// Ошибка любого запроса → error.tsx: «0 записей» и «услуги не заполнены» при сбое БД ввели бы в заблуждение.
async function loadDashboard(businessId: string, now: number): Promise<Dashboard> {
  const db = adminClient();
  const dayStart = businessDayStart(now);
  const iso = (ms: number) => new Date(ms).toISOString();
  const bookings = () => db.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
  const [today, week, pending, services, photos] = await Promise.all([
    bookings().in('status', ACTIVE).gte('scheduled_at', iso(dayStart)).lt('scheduled_at', iso(dayStart + DAY_MS)),
    bookings().in('status', ACTIVE).gte('scheduled_at', iso(now)).lt('scheduled_at', iso(now + WEEK_DAYS * DAY_MS)),
    db.from('bookings').select(BOOKING_ROW_SELECT, { count: 'exact' }).eq('business_id', businessId).eq('status', 'new')
      .gte('scheduled_at', iso(now)).order('scheduled_at', { ascending: true }).limit(PENDING_PREVIEW).returns<BookingDbRow[]>(),
    db.from('services').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('is_active', true),
    db.from('photos').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
  ]);
  if ([today, week, pending, services, photos].some((r) => r.error)) throw new Error('dashboard: load failed');
  return {
    counts: { today: today.count ?? 0, week: week.count ?? 0, pending: pending.count ?? 0, services: services.count ?? 0, photos: photos.count ?? 0 },
    pendingRows: (pending.data ?? []).map(toBookingRow),
  };
}

export default async function OwnerHome({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requirePageAccess(params);
  const b = access.business;
  const base = panelBase(params);
  const now = Date.now();
  const { counts, pendingRows } = await loadDashboard(b.id, now);

  const checklist = buildChecklist({ activeServices: counts.services, photos: counts.photos, business: b });
  const percent = progressPercent(checklist);

  // ТЗ §13.13: после заполнения — onboarding_completed_at. Условный update идемпотентен и выполняется один раз за жизнь бизнеса.
  // Сбой записи не ломает дашборд (отметка повторится при следующем открытии), но пишется в журнал.
  if (percent === 100 && !b.onboarding_completed_at) {
    const { error } = await adminClient().from('businesses').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', b.id).is('onboarding_completed_at', null);
    if (error) await logError('booking', 'panel: onboarding_completed_at not saved', { business_id: b.id, code: error.code });
  }

  const owner = isOwner(access);
  const showChecklist = owner && percent < 100;

  return (
    <div className="grid gap-8">
      <header>
        <p className="!mb-1 text-[14px] text-[#595959]">Добро пожаловать</p>
        <h1 className="!mb-0">{b.name}</h1>
      </header>

      {showChecklist && percent === 0 && (
        <section aria-labelledby="welcome-title" className="rounded-xl border border-[#e5e5e5] bg-white p-5">
          <h2 id="welcome-title">Добро пожаловать!</h2>
          <p className="text-[14px] text-[#595959]">Заполните 4 пункта ниже — и сайт готов принимать записи.</p>
        </section>
      )}

      {/* Одноразовая подсказка (localStorage, ТЗ §13.13): что главное на этом экране. */}
      <OnboardingTip slug={params.slug} tip="dashboard" title="Здесь — главное за день">
        Карточки ведут в «Брони». Новые записи можно подтвердить прямо на главной — клиент получит письмо.
      </OnboardingTip>

      <section aria-label="Записи" className="grid gap-3 sm:grid-cols-3">
        <StatCard href={`${base}/bookings`} label="Записей сегодня" value={counts.today} />
        <StatCard href={`${base}/bookings`} label="Записей на 7 дней" value={counts.week} />
        <StatCard href={`${base}/bookings`} label="Ждут подтверждения" value={counts.pending} accent={counts.pending > 0} />
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
        {owner && <Link href={`${base}/settings`} className="inline-flex min-h-[44px] items-center rounded-lg border border-[#e5e5e5] bg-white px-4 !no-underline">Настройки</Link>}
      </nav>
    </div>
  );
}

function Checklist({ base, items, percent }: { base: string; items: ChecklistItem[]; percent: number }) {
  const doneCount = items.filter((c) => c.done).length;
  return (
    <section aria-labelledby="onboarding-title" className="rounded-xl border border-[#e5e5e5] bg-white p-5">
      <h2 id="onboarding-title">Готовность сайта: {percent}%</h2>
      <div
        role="progressbar"
        aria-labelledby="onboarding-title"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`Выполнено ${doneCount} из ${items.length}`}
        className="h-2 w-full overflow-hidden rounded-full bg-[#e5e5e5]"
      >
        <div className="h-2 rounded-full" style={{ width: `${percent}%`, background: 'var(--brand-color)' }} />
      </div>
      <ol className="mt-4 grid gap-2">
        {items.map((c) => (
          <li key={c.key}>
            <Link
              href={`${base}/${c.path}`}
              className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 !no-underline ${c.done ? 'border-[#bbf7d0] bg-[#f0fdf4]' : 'border-[#e5e5e5] hover:bg-[#fafafa]'}`}
            >
              <CheckIcon done={c.done} />
              <span className="grid">
                <span className={c.done ? 'text-[#166534] line-through decoration-1' : 'font-medium'}>{c.label}</span>
                {!c.done && <span className="text-[13px] text-[#595959]">{c.hint}</span>}
              </span>
              {/* Статус текстом — цвет не единственный признак (design-spec §9). */}
              <span className="ml-auto shrink-0 text-[13px] text-[#595959]">{c.done ? 'Готово' : 'Заполнить →'}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StatCard({ href, label, value, accent = false }: { href: string; label: string; value: number; accent?: boolean }) {
  return (
    <Link href={href} className="block rounded-xl border border-[#e5e5e5] bg-white p-4 !no-underline hover:bg-[#fafafa]">
      <span className="block text-[14px] text-[#595959]">{label}</span>
      <span className={`block text-[32px] font-bold leading-tight ${accent ? 'text-[#a16207]' : ''}`}>{value}</span>
    </Link>
  );
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="12" r="10" fill={done ? '#16a34a' : 'none'} stroke={done ? '#16a34a' : '#a3a3a3'} strokeWidth="2" />
      {done && <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
