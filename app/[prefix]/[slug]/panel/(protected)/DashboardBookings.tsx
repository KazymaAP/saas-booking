'use client';

// DashboardBookings.tsx — переключатель «Сегодня / Неделя» на главной кабинета.
// Использует тот же BookingList, что и раздел «Брони»: подтвердить, отметить визит и отменить
// можно прямо с дашборда. Стиль — токены .panel-shell, от Детейленга только смысл блока.
import { useState } from 'react';
import { BookingList, type BookingRow } from './bookings/BookingList';

export function DashboardBookings({
  slug, todayRows, weekRows, now,
}: {
  slug: string;
  todayRows: BookingRow[];
  weekRows: BookingRow[];
  now: number;
}) {
  const [view, setView] = useState<'today' | 'week'>('today');
  const rows = view === 'today' ? todayRows : weekRows;

  return (
    <section aria-labelledby="dashboard-bookings-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dashboard-bookings-title" className="!mb-0">Записи</h2>
        <div className="flex gap-2" role="group" aria-label="Период записей">
          {([['today', 'Сегодня'], ['week', 'Неделя']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`!min-h-9 rounded-lg border px-3 text-[14px] ${view === key ? 'border-[var(--brand-color)] bg-[var(--brand-color)] text-[var(--on-accent)]' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'}`}
            >{label}</button>
          ))}
        </div>
      </div>
      <BookingList
        key={view}
        slug={slug}
        rows={rows}
        now={now}
        groupHeading="h3"
        emptyText={view === 'today' ? 'На сегодня записей нет' : 'На этой неделе записей нет'}
      />
    </section>
  );
}
