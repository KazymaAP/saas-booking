// app/[prefix]/[slug]/[role]/page.tsx — «Моя смена»: страница сотрудника на телефоне.
// Не дублирует кабинет: здесь только то, что нужно в зале — записи на сегодня, быстрые статусы и звонок клиенту.
// Полный кабинет остаётся по /admin и открывается ссылкой внизу (там же разделы, разрешённые ролью).
import { notFound, redirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase';
import { currentOwner } from '@/lib/owner-session';
import { isRole, ROLE_LABELS, STAFF_ROLES } from '@/lib/auth-roles';
import { canWrite } from '@/lib/sections';
import { PANEL_THEME_KEY, resolveAppearance } from '@/lib/appearance';
import { nicheOfTemplate } from '@/lib/business';
import { panelBase, sectionHref, visibleSections } from '../admin/(protected)/_lib/sections';
import { panelThemeStyle } from '../admin/(protected)/_lib/panel-theme';
import { businessDayStart, DAY_MS, formatDay, formatDateTime } from '../admin/(protected)/_lib/time';
import { ShiftList } from './ShiftList';
import { SHIFT_SELECT, shiftStats, toShiftRow, type ShiftDbRow } from './shift';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

type Params = { readonly prefix: string; readonly slug: string; readonly role: string };

// Сегодняшние записи: с начала дня по Москве до его конца. Закрытые тоже нужны — сотрудник видит, что уже отработано.
async function loadShift(businessId: string, now: number): Promise<ShiftDbRow[] | null> {
  const from = businessDayStart(now);
  const { data, error } = await adminClient()
    .from('bookings')
    .select(SHIFT_SELECT)
    .eq('business_id', businessId)
    .gte('scheduled_at', new Date(from).toISOString())
    .lt('scheduled_at', new Date(from + DAY_MS).toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(100)
    .returns<ShiftDbRow[]>();
  if (error) return null;
  return data ?? [];
}

// Ближайшая запись после сегодняшнего дня — одна строка «Дальше», чтобы смена не заканчивалась пустотой.
async function loadNext(businessId: string, now: number): Promise<string | null> {
  const from = businessDayStart(now) + DAY_MS;
  const { data } = await adminClient()
    .from('bookings')
    .select('scheduled_at')
    .eq('business_id', businessId)
    .gte('scheduled_at', new Date(from).toISOString())
    .in('status', ['new', 'confirmed'])
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .returns<{ scheduled_at: string }[]>();
  return data?.[0]?.scheduled_at ?? null;
}

export default async function StaffRolePage({ params }: { params: Params }) {
  if (!isRole(params.role) || !STAFF_ROLES.includes(params.role)) notFound();
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${panelBase(params)}/login`);
  // Роль в URL должна совпадать с ролью в БД: /d/slug/manager не откроется администратором.
  if (access.role !== params.role) notFound();

  const role = params.role;
  const base = panelBase(params);
  const sections = visibleSections(role);
  const now = Date.now();
  // Смена имеет смысл только тем, кто работает с записями. Остальным — их разделы.
  const shiftVisible = sections.some((s) => s.key === 'bookings');
  const canWriteBookings = canWrite(role, 'bookings');

  const [dbRows, nextAt] = shiftVisible
    ? await Promise.all([loadShift(access.business.id, now), loadNext(access.business.id, now)])
    : [null, null];
  if (shiftVisible && !dbRows) throw new Error('shift: load failed');

  const rows = (dbRows ?? []).map(toShiftRow);
  const stats = shiftStats(rows, now);

  const b = access.business;
  const niche = await nicheOfTemplate(b.vertical_template_id);
  const theme = resolveAppearance((b.custom_texts as Record<string, string> | null | undefined)?.[PANEL_THEME_KEY], niche);

  return (
    <div className="panel-shell min-h-screen bg-[var(--panel-bg)] pb-10" style={panelThemeStyle(theme, b.brand_color)} data-mode={theme.mode}>
      <main className="box-border mx-auto w-full max-w-[720px] px-4 pt-5">
        <header className="mb-4">
          <p className="!mb-1 text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">
            {ROLE_LABELS[role] ?? role} · {formatDay(now)}
          </p>
          <h1 className="!mb-0 text-[22px] font-semibold leading-tight">{b.name}</h1>
          {shiftVisible && (
            <p className="!mb-0 mt-1 text-[13px] text-[var(--muted)]">
              {stats.total === 0
                ? 'Записей на сегодня нет'
                : `${stats.total} ${plural(stats.total, 'запись', 'записи', 'записей')} · ждут подтверждения: ${stats.awaiting}`}
            </p>
          )}
        </header>

        {shiftVisible ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Ждут" value={stats.awaiting} />
              <Stat label="Впереди" value={stats.left} />
              <Stat label="Закрыто" value={stats.done} />
            </div>

            <ShiftList slug={params.slug} rows={rows} now={now} canWrite={canWriteBookings} />

            {nextAt && (
              <p className="!mb-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px] text-[var(--muted)]">
                Дальше: <span className="font-medium text-[var(--ink)]">{formatDateTime(nextAt)}</span>
              </p>
            )}
            {!canWriteBookings && (
              <p className="!mb-0 text-[13px] text-[var(--muted)]">Ваша роль видит записи, но не меняет их статус.</p>
            )}
          </div>
        ) : (
          <p className="box-border rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 text-[14px] text-[var(--muted)]">
            Смена показывает записи клиентов — ваша роль работает с другими разделами. Они перечислены ниже.
          </p>
        )}

        <section className="mt-6 grid gap-2">
          <h2 className="!mb-0 text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">Разделы кабинета</h2>
          <ul className="grid list-none gap-2 !p-0">
            {sections.map((section) => (
              <li key={section.key}>
                <a
                  href={sectionHref(base, section)}
                  className="box-border flex min-h-[48px] items-center justify-between rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[14px] !no-underline"
                >
                  <span className="font-medium text-[var(--ink)]">{section.label}</span>
                  <span aria-hidden="true" className="text-[var(--muted)]">→</span>
                </a>
              </li>
            ))}
            {sections.length === 0 && (
              <li className="box-border rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[13px] text-[var(--muted)]">
                Разделы не назначены. Попросите владельца выдать доступ.
              </li>
            )}
          </ul>
          <a href={base} className="mt-1 inline-flex min-h-[44px] items-center text-[13px] font-medium text-[var(--brand-color)] !no-underline">
            Открыть полный кабинет →
          </a>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="box-border rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
      <span className="block text-[19px] font-semibold leading-6 tabular-nums">{value}</span>
      <span className="block text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</span>
    </div>
  );
}

// Склонение числительных: «1 запись / 2 записи / 5 записей».
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
